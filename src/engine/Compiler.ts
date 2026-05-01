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

  // Type validation
  nodes.forEach(node => {
    const config = registry.getConfig(node.type);
    if (!config) throw new Error(`Unknown node type: ${node.type}`);

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
              console.warn(`Type mismatch on node ${node.id} port ${port}: expected ${typesArray.join('|')}, got ${sourceOutType}`);
            }
          }
        }
      });
    }
  });

  // Partition by pass_boundary nodes
  const passOutputs: string[] = [];
  nodes.forEach(n => {
    if (n.type === 'pass_boundary') passOutputs.push(n.id);
  });
  passOutputs.push(graph.outputNodeId); // final pass

  const passes: CompiledShader[] = [];

  passOutputs.forEach((outputId, index) => {
    const isFinal = index === passOutputs.length - 1;

    // Topological sort scoped to this pass
    const visited = new Set<string>();
    const sorted: NodeDef[] = [];

    function visit(id: string) {
      if (visited.has(id)) return;
      const node = nodesById.get(id);
      if (!node) return;
      // Stop at foreign pass_boundary (will be read as texture)
      if (node.type === 'pass_boundary' && id !== outputId) return;

      visited.add(id);
      Object.values(node.inputs).forEach(input => {
        if (input.nodeId) visit(input.nodeId);
      });
      sorted.push(node);
    }
    visit(outputId);

    /* ---- collect uniforms & dependencies ---- */
    const uniforms: Record<string, { type: string; value: any }> = {};
    const uniformDeclarations: string[] = [];
    const dependencies = new Set<string>();

    sorted.forEach(node => {
      const config = registry.getConfig(node.type);
      config.glslDependencies?.forEach(dep => dependencies.add(dep));

      // Declare ALL uniform types (including samplers) — not just those returned
      // by getUniforms(). getUniforms() provides default values for non-sampler
      // uniforms; sampler uniforms are bound by the renderer at draw time.
      if (config.uniformTypes) {
        const runtimeValues = config.getUniforms?.(node) ?? {};
        Object.entries(config.uniformTypes).forEach(([key, glslType]) => {
          const uniformName = `u_${node.id}_${key}`;
          uniformDeclarations.push(`uniform ${glslType} ${uniformName};`);
          uniforms[uniformName] = { type: glslType, value: runtimeValues[key] ?? null };
        });
      }
    });

    /* ---- build fragment shader ---- */
    let fragmentCode = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;
`;
    // Add passTex uniforms for cross-pass reads
    sorted.forEach(node => {
      Object.values(node.inputs).forEach(input => {
        if (input.nodeId) {
          const src = nodesById.get(input.nodeId);
          if (src && src.type === 'pass_boundary' && src.id !== outputId) {
            const uName = `u_${src.id}_passTex`;
            if (!uniforms[uName]) {
              uniformDeclarations.push(`uniform sampler2D ${uName};`);
              uniforms[uName] = { type: 'sampler2D', value: null };
            }
          }
        }
      });
    });

    fragmentCode += uniformDeclarations.join('\n') + '\n\n';
    dependencies.forEach(dep => { fragmentCode += dep + '\n\n'; });

    fragmentCode += `void main() {\n`;
    fragmentCode += `  vec2 baseUv = vUv;\n`;

    const inlineExpressions: Record<string, string> = {};

    sorted.forEach(node => {
      const config = registry.getConfig(node.type);

      // If this is the pass_boundary that IS this pass's output, emit fragColor
      if (node.type === 'pass_boundary' && node.id === outputId && !isFinal) {
        const inputPort = node.inputs['in'];
        let val = '0.0';
        if (inputPort?.nodeId) {
          val = inlineExpressions[inputPort.nodeId] ?? `out_${inputPort.nodeId}`;
        }
        fragmentCode += `  fragColor = vec4(${val}, ${val}, ${val}, 1.0);\n`;
        return;
      }

      const getInputValue = (port: string): string => {
        const input = node.inputs[port];
        if (!input) return '0.0';
        if (input.nodeId) {
          const sourceNode = nodesById.get(input.nodeId)!;
          if (sourceNode.type === 'pass_boundary' && sourceNode.id !== outputId) {
            return `texture(u_${sourceNode.id}_passTex, baseUv).r`;
          }
          if (inlineExpressions[input.nodeId]) return inlineExpressions[input.nodeId];
          return `out_${input.nodeId}`;
        }
        if (input.value !== undefined) return input.value;
        return '0.0';
      };

      if (node.type === 'pass_boundary' && node.id !== outputId) return;

      const nodeCode = config.generateCode(node, getInputValue);
      if (config.inline) {
        inlineExpressions[node.id] = nodeCode;
      } else {
        fragmentCode += `  // Node: ${node.id} (${node.type})\n`;
        fragmentCode += `  ${nodeCode}\n\n`;
      }
    });

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

    passes.push({ passId: outputId, vertexShader, fragmentShader: fragmentCode, uniforms, isFinal });
  });

  return passes;
}
