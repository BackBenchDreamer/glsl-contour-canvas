"use client";

import React, { useMemo, useState } from 'react';
import { GraphDef, NodeDef } from '../engine/Graph';
import { registry } from '../engine/Registry';

interface NodeGraphPanelProps {
  graph: GraphDef | null;
}

interface LayoutNode {
  id: string;
  type: string;
  name: string;
  fieldType: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutEdge {
  from: string;
  to: string;
  port: string;
}

const NODE_W = 160;
const NODE_H = 48;
const GAP_X = 40;
const GAP_Y = 20;
const PADDING = 20;

function layoutGraph(graph: GraphDef): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const nodesById = new Map<string, NodeDef>();
  graph.nodes.forEach(n => nodesById.set(n.id, n));

  // Build adjacency for topological levels
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  graph.nodes.forEach(n => {
    if (!children.has(n.id)) children.set(n.id, []);
    if (!parents.has(n.id)) parents.set(n.id, []);
  });

  graph.nodes.forEach(n => {
    Object.values(n.inputs).forEach(input => {
      if (input.nodeId) {
        if (!children.has(input.nodeId)) children.set(input.nodeId, []);
        children.get(input.nodeId)!.push(n.id);
        if (!parents.has(n.id)) parents.set(n.id, []);
        parents.get(n.id)!.push(input.nodeId);
      }
    });
  });

  // Find roots (no parents)
  const roots = graph.nodes.filter(n => {
    const p = parents.get(n.id);
    return !p || p.length === 0;
  });

  // BFS to assign levels
  const levels = new Map<string, number>();
  const queue: string[] = [];
  roots.forEach(r => {
    levels.set(r.id, 0);
    queue.push(r.id);
  });

  while (queue.length > 0) {
    const id = queue.shift()!;
    const level = levels.get(id)!;
    const childIds = children.get(id) || [];
    childIds.forEach(cid => {
      const existing = levels.get(cid);
      if (existing === undefined || existing < level + 1) {
        levels.set(cid, level + 1);
        queue.push(cid);
      }
    });
  }

  // Group by level
  const levelGroups = new Map<number, string[]>();
  levels.forEach((level, id) => {
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(id);
  });

  const layoutNodes: LayoutNode[] = [];
  const maxLevel = Math.max(...Array.from(levels.values()), 0);

  levelGroups.forEach((ids, level) => {
    ids.forEach((id, idx) => {
      const node = nodesById.get(id)!;
      let configName = node.type;
      let outType = '';
      try {
        const config = registry.getConfig(node.type);
        configName = config.name || node.type;
        if (config.outputType) {
          outType = String(
            typeof config.outputType === 'function' ? config.outputType(node) : config.outputType
          );
        }
      } catch {
        // Unknown node type — use defaults
      }

      const x = PADDING + level * (NODE_W + GAP_X);
      const y = PADDING + idx * (NODE_H + GAP_Y);

      layoutNodes.push({
        id: node.id,
        type: node.type,
        name: configName,
        fieldType: outType ? String(outType) : '',
        x, y,
        width: NODE_W,
        height: NODE_H,
      });
    });
  });

  // Edges
  const edges: LayoutEdge[] = [];
  graph.nodes.forEach(n => {
    Object.entries(n.inputs).forEach(([port, input]) => {
      if (input.nodeId) {
        edges.push({ from: input.nodeId, to: n.id, port });
      }
    });
  });

  return { nodes: layoutNodes, edges };
}

export const NodeGraphPanel: React.FC<NodeGraphPanelProps> = ({ graph }) => {
  const [isOpen, setIsOpen] = useState(false);

  const layout = useMemo(() => {
    if (!graph) return null;
    return layoutGraph(graph);
  }, [graph]);

  if (!layout) return null;

  const svgWidth = Math.max(
    ...layout.nodes.map(n => n.x + n.width + PADDING),
    300
  );
  const svgHeight = Math.max(
    ...layout.nodes.map(n => n.y + n.height + PADDING),
    200
  );

  const nodeMap = new Map<string, LayoutNode>();
  layout.nodes.forEach(n => nodeMap.set(n.id, n));

  const fieldTypeColors: Record<string, string> = {
    StaticScalar: '#4fd1a5',
    DynamicScalar: '#ff9f43',
    Vector2: '#6bb5ff',
    Vector3: '#c084fc',
    Vector4: '#f472b6',
    Sampler2D: '#fbbf24',
  };

  return (
    <>
      <button
        className="graph-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? 'Close node graph' : 'Show node graph'}
        id="graph-toggle-btn"
        style={isOpen ? { right: `calc(var(--panel-width) + 20px)` } : undefined}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          {isOpen ? (
            <path d="M11 1L5 8L11 15" />
          ) : (
            <>
              <circle cx="4" cy="4" r="1.5" fill="currentColor" />
              <circle cx="12" cy="8" r="1.5" fill="currentColor" />
              <circle cx="4" cy="12" r="1.5" fill="currentColor" />
              <line x1="5.5" y1="4" x2="10.5" y2="8" />
              <line x1="5.5" y1="12" x2="10.5" y2="8" />
            </>
          )}
        </svg>
      </button>
      <div className={`graph-panel glass-panel ${isOpen ? 'open' : ''}`} id="node-graph-panel">
        <div className="graph-panel-header">
          <h2>Live DAG</h2>
          <span style={{
            fontFamily: 'var(--mono)',
            fontSize: '9px',
            color: 'var(--hud-text-dim)',
            letterSpacing: '0.05em',
          }}>
            {layout.nodes.length} nodes · {layout.edges.length} edges
          </span>
        </div>
        <div className="graph-panel-body">
          <svg
            width="100%"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ display: 'block', minHeight: svgHeight }}
          >
            {/* Edges */}
            {layout.edges.map((edge, i) => {
              const from = nodeMap.get(edge.from);
              const to = nodeMap.get(edge.to);
              if (!from || !to) return null;

              const x1 = from.x + from.width;
              const y1 = from.y + from.height / 2;
              const x2 = to.x;
              const y2 = to.y + to.height / 2;
              const cx = (x1 + x2) / 2;

              return (
                <path
                  key={`edge-${i}`}
                  className="graph-edge animated"
                  d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                />
              );
            })}

            {/* Nodes */}
            {layout.nodes.map((node) => {
              const typeColor = fieldTypeColors[node.fieldType] || 'var(--hud-text-dim)';
              return (
                <g key={node.id} className="graph-node" transform={`translate(${node.x},${node.y})`}>
                  <rect
                    width={node.width}
                    height={node.height}
                    style={{ stroke: `${typeColor}33` }}
                  />
                  {/* Colored left accent bar */}
                  <rect
                    x="0" y="0"
                    width="3" height={node.height}
                    rx="1.5"
                    fill={typeColor}
                    opacity="0.6"
                  />
                  <text className="node-label" x="12" y="19">
                    {node.id}
                  </text>
                  <text className="node-type" x="12" y="32">
                    {node.name}
                  </text>
                  {node.fieldType && (
                    <text
                      className="node-field-badge"
                      x={node.width - 8}
                      y="14"
                      textAnchor="end"
                      fill={typeColor}
                    >
                      {node.fieldType}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </>
  );
};
