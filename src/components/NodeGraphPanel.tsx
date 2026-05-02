"use client";

import React, { useMemo, useRef, useCallback } from 'react';
import { GraphDef, NodeDef } from '../engine/Graph';
import { registry } from '../engine/Registry';

/* ─────────────────────────────────────────────
   DATA — Types (read-only from graph)
   ───────────────────────────────────────────── */
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
  sourceFieldType: string;
}

/* ─────────────────────────────────────────────
   LAYOUT — BFS top→bottom, centered rows
   ───────────────────────────────────────────── */
const NODE_W = 130;
const NODE_H = 34;
const GAP_X = 16;
const GAP_Y = 28;
const PADDING = 24;

const FIELD_TYPE_COLORS: Record<string, string> = {
  StaticScalar: '#1D9E75',
  DynamicScalar: '#1D9E75',
  scalar: '#1D9E75',
  Vector2: '#EF9F27',
  vec2: '#EF9F27',
  Vector3: '#7F77DD',
  vec3: '#7F77DD',
  Vector4: '#7F77DD',
  vec4: '#7F77DD',
  color: '#7F77DD',
  Sampler2D: '#EF9F27',
};

function layoutGraph(graph: GraphDef): {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  viewBox: { x: number; y: number; w: number; h: number };
} {
  const nodesById = new Map<string, NodeDef>();
  graph.nodes.forEach(n => nodesById.set(n.id, n));

  // Build adjacency
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

  // Find source nodes (no parents) — BFS roots
  const roots = graph.nodes.filter(n => {
    const p = parents.get(n.id);
    return !p || p.length === 0;
  });

  // BFS to assign levels (top→bottom: level 0 at top)
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

  // Find max row width to center all rows
  let maxRowWidth = 0;
  levelGroups.forEach(ids => {
    const rowWidth = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
  });

  const layoutNodes: LayoutNode[] = [];

  levelGroups.forEach((ids, level) => {
    const rowWidth = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    const rowOffsetX = (maxRowWidth - rowWidth) / 2;

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

      // Top→bottom layout: level = row (Y), idx = column (X)
      const x = PADDING + rowOffsetX + idx * (NODE_W + GAP_X);
      const y = PADDING + level * (NODE_H + GAP_Y);

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

  // Edges with source field type
  const edges: LayoutEdge[] = [];
  const nodeFieldMap = new Map<string, string>();
  layoutNodes.forEach(n => nodeFieldMap.set(n.id, n.fieldType));

  graph.nodes.forEach(n => {
    Object.entries(n.inputs).forEach(([port, input]) => {
      if (input.nodeId) {
        edges.push({
          from: input.nodeId,
          to: n.id,
          port,
          sourceFieldType: nodeFieldMap.get(input.nodeId) || '',
        });
      }
    });
  });

  // Compute SVG viewBox from actual node positions + 24px padding all sides
  const minX = layoutNodes.length > 0
    ? Math.min(...layoutNodes.map(n => n.x)) - PADDING
    : 0;
  const minY = layoutNodes.length > 0
    ? Math.min(...layoutNodes.map(n => n.y)) - PADDING
    : 0;
  const maxX = layoutNodes.length > 0
    ? Math.max(...layoutNodes.map(n => n.x + n.width)) + PADDING
    : 300;
  const maxY = layoutNodes.length > 0
    ? Math.max(...layoutNodes.map(n => n.y + n.height)) + PADDING
    : 200;

  return {
    nodes: layoutNodes,
    edges,
    viewBox: {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    },
  };
}

/* ─────────────────────────────────────────────
   FIELD TYPE BADGE LABEL
   ───────────────────────────────────────────── */
function getFieldBadge(fieldType: string): string {
  if (!fieldType) return '';
  const ft = fieldType.toLowerCase();
  if (ft.includes('scalar')) return 'scalar';
  if (ft === 'vector2' || ft === 'vec2') return 'vec2';
  if (ft === 'vector3' || ft === 'vec3' || ft === 'vector4' || ft === 'vec4' || ft === 'color') return 'color';
  if (ft === 'sampler2d') return 'tex';
  return fieldType;
}

/* ─────────────────────────────────────────────
   RENDER — DAG panel content (no self-managed show/hide)
   Sidebar handles visibility; this component just renders
   the header label + SVG graph.
   ───────────────────────────────────────────── */
export const NodeGraphPanel: React.FC<NodeGraphPanelProps> = ({ graph }) => {
  // Layout computed ONLY when graph changes
  const layout = useMemo(() => {
    if (!graph) return null;
    return layoutGraph(graph);
  }, [graph]);

  // ─── SVG INTERACTION: refs-only, no React state for zoom/pan ───
  const svgGRef = useRef<SVGGElement>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const zoomLabelRef = useRef<HTMLSpanElement>(null);

  const applyTransform = useCallback(() => {
    const g = svgGRef.current;
    if (!g) return;
    const t = transformRef.current;
    g.setAttribute('transform', `translate(${t.x},${t.y}) scale(${t.scale})`);
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${t.scale.toFixed(1)}×`;
    }
  }, []);

  const resetTransform = useCallback(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    applyTransform();
  }, [applyTransform]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const t = transformRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(3, Math.max(0.5, t.scale * delta));
    const ratio = newScale / t.scale;

    t.x = mx - ratio * (mx - t.x);
    t.y = my - ratio * (my - t.y);
    t.scale = newScale;
    applyTransform();
  }, [applyTransform]);

  // Pan — drag background
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).closest('.dag-node-group')) return;
    isPanning.current = true;
    panStart.current.x = e.clientX;
    panStart.current.y = e.clientY;
    panOrigin.current.x = transformRef.current.x;
    panOrigin.current.y = transformRef.current.y;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isPanning.current) return;
    const t = transformRef.current;
    t.x = panOrigin.current.x + (e.clientX - panStart.current.x);
    t.y = panOrigin.current.y + (e.clientY - panStart.current.y);
    applyTransform();
  }, [applyTransform]);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  if (!layout) return null;

  const { nodes, edges, viewBox } = layout;
  const nodeMap = new Map<string, LayoutNode>();
  nodes.forEach(n => nodeMap.set(n.id, n));

  return (
    <>
      {/* Header — non-interactive label row */}
      <div className="dag-sidebar-header" id="dag-sidebar-header">
        <div className="dag-header-left">
          <span className="dag-header-dot" />
          <h2>LIVE DAG</h2>
        </div>
        <span className="dag-panel-meta">
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>

      {/* SVG graph body */}
      <div className="dag-sidebar-body" id="node-graph-panel">
        <svg
          className="dag-svg-viewport"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          preserveAspectRatio="xMidYMid meet"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Grid pattern background */}
          <defs>
            <pattern id="dag-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.5" fill="rgba(255,255,255,0.06)" />
            </pattern>
          </defs>
          <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#dag-grid)" />

          <g ref={svgGRef}>
            {/* Edges — cubic bezier, vertical ±40px control points */}
            {edges.map((edge, i) => {
              const from = nodeMap.get(edge.from);
              const to = nodeMap.get(edge.to);
              if (!from || !to) return null;

              // Source bottom center → target top center
              const x1 = from.x + from.width / 2;
              const y1 = from.y + from.height;
              const x2 = to.x + to.width / 2;
              const y2 = to.y;

              const strokeColor = FIELD_TYPE_COLORS[edge.sourceFieldType] || 'rgba(0,255,204,0.3)';

              return (
                <path
                  key={`edge-${i}`}
                  className="dag-edge"
                  d={`M${x1},${y1} C${x1},${y1 + 40} ${x2},${y2 - 40} ${x2},${y2}`}
                  stroke={strokeColor}
                  strokeOpacity={0.55}
                />
              );
            })}

            {/* Node cards — SVG */}
            {nodes.map(node => {
              const badgeColor = FIELD_TYPE_COLORS[node.fieldType] || '#555';
              const badgeLabel = getFieldBadge(node.fieldType);
              return (
                <g key={node.id} className="dag-node-group" transform={`translate(${node.x},${node.y})`}>
                  {/* Shadow */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={6} ry={6}
                    fill="rgba(0,0,0,0.4)"
                    transform="translate(1,1)"
                  />
                  {/* Card background */}
                  <rect
                    className="dag-node-rect"
                    width={node.width}
                    height={node.height}
                    rx={6} ry={6}
                  />
                  {/* Left accent bar */}
                  <rect
                    x={0} y={4}
                    width={2.5}
                    height={node.height - 8}
                    rx={1.25}
                    fill={badgeColor}
                    opacity={0.85}
                  />
                  {/* Border */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={6} ry={6}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth={1}
                    className="dag-node-border"
                  />
                  {/* Node ID label */}
                  <text className="dag-node-id-text" x={10} y={14}>
                    {node.id}
                  </text>
                  {/* Node type label */}
                  <text className="dag-node-type-text" x={10} y={26}>
                    {node.name}
                  </text>
                  {/* Field type badge */}
                  {badgeLabel && (
                    <g>
                      <rect
                        x={node.width - 6 - badgeLabel.length * 5.5 - 6}
                        y={4}
                        width={badgeLabel.length * 5.5 + 8}
                        height={14}
                        rx={3}
                        fill={badgeColor}
                        opacity={0.15}
                      />
                      <text
                        className="dag-node-badge-text"
                        x={node.width - 6}
                        y={14}
                        fill={badgeColor}
                        textAnchor="end"
                      >
                        {badgeLabel}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Floating controls — bottom-right of body */}
        <div className="dag-controls">
          <span className="dag-zoom-label" ref={zoomLabelRef}>1.0×</span>
          <button
            className="dag-reset-btn"
            onClick={resetTransform}
            title="Reset zoom/pan"
            id="dag-reset-btn"
          >
            ⌂
          </button>
        </div>
      </div>
    </>
  );
};
