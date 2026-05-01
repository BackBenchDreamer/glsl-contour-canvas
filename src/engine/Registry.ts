import { NodeDef, FieldType } from './Graph';

export interface NodeTypeConfig {
  name: string;
  // Field type constraints
  inputs?: Record<string, FieldType | FieldType[]>;
  outputType?: FieldType | ((node: NodeDef) => FieldType);
  // Whether this node's output should be inlined into dependents
  inline?: boolean;
  // Any GLSL helper functions required by this node (e.g., snoise)
  glslDependencies?: string[];
  // Generates the code block for this node.
  // getInputValue is a helper to get the variable name or constant value for an input.
  generateCode: (node: NodeDef, getInputValue: (port: string) => string) => string;
  // Uniforms specific to this node (returns mapping of uniform name -> value)
  getUniforms?: (node: NodeDef) => Record<string, any>;
  // Types of uniforms for declaration
  uniformTypes?: Record<string, string>;
}

class NodeRegistry {
  private configs: Record<string, NodeTypeConfig> = {};

  register(type: string, config: NodeTypeConfig) {
    this.configs[type] = config;
  }

  getConfig(type: string): NodeTypeConfig {
    if (!this.configs[type]) {
      throw new Error(`Node type ${type} not registered`);
    }
    return this.configs[type];
  }

  getAllDependencies(): string[] {
    const deps = new Set<string>();
    Object.values(this.configs).forEach(config => {
      config.glslDependencies?.forEach(dep => deps.add(dep));
    });
    return Array.from(deps);
  }
}

export const registry = new NodeRegistry();
