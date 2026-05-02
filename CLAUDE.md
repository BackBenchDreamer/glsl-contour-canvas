@AGENTS.md

# Node Contour Engine — Architecture Guide

> A browser-native GLSL compiler that takes a typed node graph as input and emits optimized WebGL2 shader programs in real time — with ping-pong framebuffers for temporal effects and strict DAG validation to prevent invalid field compositions.

## Agent Behavior Rules

- DO NOT use browser automation tools (no Puppeteer, no screenshot loops).
- DO NOT start a dev server to verify visual output.
- Verify all changes by reading source code only.
- If unsure whether a change is correct, output a question — do not loop.
- Maximum 3 tool calls before pausing to summarize progress.

## Compilation Pipeline

```
GraphDef (JSON)
    │
    ▼
┌─────────────────────────────────┐
│  Type Validation                │  Validates FieldType at every edge
│  (Compiler.ts)                  │  against NodeTypeConfig.inputs
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Pass Partitioning              │  Splits graph at `pass_boundary` nodes
│                                 │  Each partition → one shader program
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Topological Sort (per pass)    │  DFS from pass output, stops at
│                                 │  foreign pass_boundary nodes
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  GLSL Code Generation           │  Inlines trivial nodes (math_add, etc)
│                                 │  Deduplicates glslDependencies
│                                 │  Emits `#version 300 es` fragment shader
└──────────────┬──────────────────┘
               │
               ▼
  CompiledShader[] → WebGLRenderer
```

## Field Type System

```
StaticScalar   — float, does not depend on previous frame
DynamicScalar  — float, may depend on temporal feedback
Vector2        — vec2 (UV coordinates, offsets)
Vector3        — vec3 (colors)
Vector4        — vec4
Sampler2D      — texture (cross-pass reads, feedback)
```

**Constraint enforcement**: Each `NodeTypeConfig.inputs` maps port names to
accepted `FieldType | FieldType[]`. The compiler validates every edge at
compile time and `console.warn`s on mismatch (does not hard-fail to allow
experimental wiring).

## File Map

### Hot path — do NOT refactor casually
- `src/engine/Compiler.ts` — DAG → GLSL. The core innovation.
- `src/renderer/WebGLRenderer.ts` — Multi-pass render loop, ping-pong FBOs, uniform dispatch.
- `src/nodes/NodeTypes.ts` — All registered node type configs. Adding nodes here is safe; changing existing ones affects every graph.

### Safe to edit
- `src/ui/Playground.tsx` — Top-level UI orchestration (Leva, presets, overlays).
- `src/components/*` — UI overlay components (HUD, graph panel, export buttons).
- `src/data/presets.ts` — Preset configurations (graph param sets).
- `src/app/` — Next.js App Router shell.

### Engine internals
- `src/engine/Graph.ts` — Type definitions (`NodeDef`, `GraphDef`, `FieldType`).
- `src/engine/Registry.ts` — Singleton `NodeRegistry`. All node types must `register()` here before use.
- `src/nodes/glsl/` — Raw GLSL snippets (simplex noise, FBM) injected via `glslDependencies`.

## Known Gotchas

### WebGL state leaks
The renderer binds VAO, program, and FBO per pass. If you add a new pass type,
ensure you `bindFramebuffer(null)` before the final pass or you'll render to an
offscreen buffer invisibly.

### Framebuffer completeness
Float FBOs (`RGBA32F`) require `EXT_color_buffer_float`. The renderer auto-falls
back to `RGBA8` if the extension is missing, but this loses precision for
temporal effects. Check `WebGLRenderer.useFloatFBO`.

### Uniform name collisions
All uniforms are prefixed `u_{nodeId}_{paramName}`. If two nodes share the same
`id`, their uniforms collide silently. Node IDs must be unique within a graph.

### Inline nodes
Nodes with `inline: true` don't emit a variable declaration — their code is
substituted directly into dependent expressions. This means they can't be
referenced by multiple dependents without code duplication. Currently only
simple math ops use this.

### Dependency deduplication
`glslDependencies` are collected into a `Set<string>` and emitted once per
fragment shader. If two dependencies define conflicting function signatures
(e.g., two different `permute()` implementations), the shader will fail to
compile. Ensure GLSL snippets use unique function names.

## Adding a New Node

1. Create GLSL helper in `src/nodes/glsl/yourHelper.ts` (if needed)
2. Register in `src/nodes/NodeTypes.ts`:
   ```ts
   registry.register('your_node', {
     name: 'Your Node',
     inputs: { uv: FieldType.Vector2 },
     outputType: FieldType.StaticScalar,
     glslDependencies: [yourHelper],
     uniformTypes: { param: 'float' },
     getUniforms: (node) => ({ param: node.params.param ?? 1.0 }),
     generateCode: (node, getInput) => {
       return `float out_${node.id} = yourFunc(${getInput('uv')}, u_${node.id}_param);`;
     },
   });
   ```
3. Wire it into a graph in `Playground.tsx` or a preset in `src/data/presets.ts`
4. The compiler handles everything else: topological sort, uniform declaration, dependency injection

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build — validates types
```
