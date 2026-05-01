export enum FieldType {
  StaticScalar = 'StaticScalar',
  DynamicScalar = 'DynamicScalar',
  Vector2 = 'Vector2',
  Vector3 = 'Vector3',
  Vector4 = 'Vector4',
  Sampler2D = 'Sampler2D'
}

export interface NodeInput {
  nodeId?: string;
  value?: string; 
}

export interface NodeDef {
  id: string;
  type: string;
  params: Record<string, any>;
  inputs: Record<string, NodeInput>;
}

export interface GraphDef {
  nodes: NodeDef[];
  outputNodeId: string;
}

export function exportGraph(graph: GraphDef): string {
  return JSON.stringify(graph, null, 2);
}

export function importGraph(json: string): GraphDef {
  const parsed = JSON.parse(json);
  // Basic validation could go here
  return parsed as GraphDef;
}
