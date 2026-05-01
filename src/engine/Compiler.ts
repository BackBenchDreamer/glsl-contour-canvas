import { GraphDef, NodeDef } from './Graph';
import { registry } from './Registry';

export interface CompiledShader {
  passId: string;
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { type: string; value: any }>;
  isFinal: boolean;
}

export function compileGraph(graph: GraphDef): CompiledShader[] {
  const nodes = graph.nodes;
  const nodesById = new Map<string, NodeDef>();
  nodes.forEach(n => nodesById.set(n.id, n));

  // Type validation and connection check
  nodes.forEach(node => {
    const config = registry.getConfig(node.type);
    if (!config) throw new Error(`Unknown node type: ${node.type}`);
    
    // Check if required inputs exist and types match
    if (config.inputs) {
      Object.entries(config.inputs).forEach(([port, expectedType]) => {
        const input = node.inputs[port];
        if (input && input.nodeId) {
          const sourceNode = nodesById.get(input.nodeId);
          if (!sourceNode) throw new Error(`Node ${node.id} references missing node ${input.nodeId}`);
          
          const sourceConfig = registry.getConfig(sourceNode.type);
          const sourceOutType = typeof sourceConfig.outputType === 'function' 
            ? sourceConfig.outputType(sourceNode) 
            : sourceConfig.outputType;

          if (sourceOutType) {
            const typesArray = Array.isArray(expectedType) ? expectedType : [expectedType];
            if (!typesArray.includes(sourceOutType)) {
              console.warn(`Type mismatch on node ${node.id} port ${port}: Expected ${typesArray.join(' or ')} but got ${sourceOutType}`);
            }
          }
        }
      });
    }
  });

  // Find pass boundaries. A graph is partitioned into multiple passes.
  // We'll do a simple partitioning: 
  // Each pass outputs to an FBO (or screen for the final pass).
  // A 'pass_boundary' node acts as the output of Pass N, and the input of Pass N+1.
  const passOutputs: string[] = [];
  nodes.forEach(n => {
    if (n.type === 'pass_boundary') passOutputs.push(n.id);
  });
  passOutputs.push(graph.outputNodeId); // Final pass

  const passes: CompiledShader[] = [];
  
  passOutputs.forEach((outputId, index) => {
    const isFinal = index === passOutputs.length - 1;
    
    // Topological sort for this pass
    const visited = new Set<string>();
    const sorted: NodeDef[] = [];
    
    function visit(id: string) {
      if (visited.has(id)) return;
      
      const node = nodesById.get(id);
      if (!node) return;
      
      // If we reach another pass_boundary, stop (it will be read as a texture)
      if (node.type === 'pass_boundary' && id !== outputId) {
        return;
      }
      
      visited.add(id);
      Object.values(node.inputs).forEach(input => {
        if (input.nodeId) {
          visit(input.nodeId);
        }
      });
      sorted.push(node);
    }

    visit(outputId);

    let fragmentCode = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;
`;

    const uniforms: Record<string, { type: string; value: any }> = {};
    const uniformDeclarations: string[] = [];
    const dependencies = new Set<string>();

    sorted.forEach(node => {
      const config = registry.getConfig(node.type);
      config.glslDependencies?.forEach(dep => dependencies.add(dep));

      if (config.getUniforms && config.uniformTypes) {
        const nodeUniforms = config.getUniforms(node);
        Object.entries(nodeUniforms).forEach(([key, value]) => {
          const uniformName = `u_${node.id}_${key}`;
          const uniformType = config.uniformTypes![key];
          uniformDeclarations.push(`uniform ${uniformType} ${uniformName};`);
          uniforms[uniformName] = { type: uniformType, value };
        });
      }
    });

    fragmentCode += uniformDeclarations.join('\n') + '\n\n';

    dependencies.forEach(dep => {
      fragmentCode += dep + '\n\n';
    });

    fragmentCode += `void main() {\n`;
    fragmentCode += `  vec2 baseUv = vUv;\n`;

    const inlineExpressions: Record<string, string> = {};

    sorted.forEach(node => {
      const config = registry.getConfig(node.type);
      
      if (node.type === 'pass_boundary' && node.id === outputId && !isFinal) {
        // This is the output node of this pass.
        // It outputs the input value to the FBO.
        const inputPort = node.inputs['in'];
        let val = '0.0';
        if (inputPort?.nodeId) {
          val = inlineExpressions[inputPort.nodeId] || `out_${inputPort.nodeId}`;
        }
        fragmentCode += `  fragColor = vec4(${val}, 0.0, 0.0, 1.0);\n`;
        return;
      }

      const getInputValue = (port: string) => {
        const input = node.inputs[port];
        if (!input) return '0.0';
        if (input.nodeId) {
          const sourceNode = nodesById.get(input.nodeId)!;
          if (sourceNode.type === 'pass_boundary' && sourceNode.id !== outputId) {
             // We read from the FBO of the previous pass
             return `texture(u_${sourceNode.id}_passTex, baseUv).r`;
          }
          if (inlineExpressions[input.nodeId]) {
            return inlineExpressions[input.nodeId];
          }
          return `out_${input.nodeId}`;
        }
        if (input.value !== undefined) return input.value;
        return '0.0';
      };

      if (node.type === 'pass_boundary' && node.id !== outputId) {
         // Should not reach here because of 'visit' stop, but if it does, it's just a texture read.
         return;
      }

      const nodeCode = config.generateCode(node, getInputValue);
      if (config.inline) {
        inlineExpressions[node.id] = nodeCode;
      } else {
        fragmentCode += `  // Node: ${node.id} (${node.type})\n`;
        fragmentCode += `  ${nodeCode}\n\n`;
      }
    });

    if (!isFinal && !sorted.some(n => n.type === 'pass_boundary' && n.id === outputId)) {
        // Safety fallback if no explicit fragColor was written
        fragmentCode += `  fragColor = vec4(0.0);\n`;
    }

    fragmentCode += `}\n`;

    const vertexShader = `#version 300 es
in vec4 aPosition;
in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = aPosition;
}
`;

    // Add passTex uniform if this pass reads from a pass_boundary
    sorted.forEach(node => {
       Object.values(node.inputs).forEach(input => {
          if (input.nodeId) {
            const src = nodesById.get(input.nodeId);
            if (src && src.type === 'pass_boundary' && src.id !== outputId) {
               uniforms[`u_${src.id}_passTex`] = { type: 'sampler2D', value: null };
            }
          }
       });
    });

    passes.push({
      passId: outputId,
      vertexShader,
      fragmentShader: fragmentCode,
      uniforms,
      isFinal
    });
  });

  return passes;
}
