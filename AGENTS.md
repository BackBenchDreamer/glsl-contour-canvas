# AGENTS.md

This file provides guidance to agents when working with code in this repository.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Stack
- **Next.js 16 / React 19 / TypeScript** (strict mode, `moduleResolution: bundler`)
- **Tailwind v4** (PostCSS-based, no `tailwind.config.*` file — config lives in `postcss.config.mjs`)
- **Leva** for runtime UI controls
- **Vitest** for unit tests (`npm test` / `npm run test:watch`)

## Commands
```bash
npm run dev            # http://localhost:3000
npm run build          # production build — also validates TypeScript
npm run lint           # eslint (flat config, eslint-config-next/core-web-vitals + typescript)
npm test               # vitest run (single run)
npm run test:watch     # vitest watch mode
npx tsc --noEmit       # type-check without building
```

## Agent Behavior Rules (from CLAUDE.md)
- DO NOT use browser automation tools (no Puppeteer, no screenshot loops).
- DO NOT start a dev server to verify visual output.
- Verify all changes by reading source code only.
- Maximum 3 tool calls before pausing to summarize progress.

## Architecture — Hot Path (do NOT refactor casually)
- `src/engine/Compiler.ts` — `GraphDef` → `CompiledShader[]`. Core compiler: type validation → pass partitioning → topo-sort → GLSL codegen.
- `src/renderer/WebGLRenderer.ts` — multi-pass render loop, ping-pong FBOs, uniform dispatch.
- `src/nodes/NodeTypes.ts` — all `NodeTypeConfig` registrations. Changing existing ones affects every graph.
- `src/engine/Registry.ts` — singleton `registry`. All node types must call `registry.register()` before use; `src/nodes/index.ts` is the entry point that triggers registration.

## Critical Patterns

### Uniform naming — must match exactly
All uniforms follow `u_{nodeId}_{paramName}`. Node IDs **must be unique** within a graph — duplicates cause silent uniform collisions.

### Inline nodes
Nodes with `inline: true` skip variable declaration; their `generateCode` returns an **expression** (no semicolons, no `out_` variable), substituted inline. They cannot be safely referenced by multiple dependents.

### Pass boundary / cross-pass reads
`pass_boundary` nodes split the graph into separate shader programs. Downstream passes read the boundary output via `u_{boundaryNodeId}_passTex` (a `sampler2D`), not from a local variable. The renderer binds the previous pass's texture to this slot.

### GLSL dependencies
`glslDependencies` strings are deduplicated into a `Set` and emitted once per shader. Function names in GLSL snippets (`src/nodes/glsl/*.ts`) must be globally unique — name collisions cause shader compile failure with no helpful error.

### WebGL state
Always call `bindFramebuffer(null)` before the final pass or the output renders to an offscreen buffer invisibly. The renderer handles this for existing passes — be careful when adding new pass types.

### Type validation is warn-only
The compiler emits `console.warn` on `FieldType` mismatches but does **not** throw — mismatched edges will compile and may produce garbage output silently.

### Float FBO precision
`RGBA32F` FBOs require `EXT_color_buffer_float`. If the extension is missing the renderer falls back to `RGBA8` (see `WebGLRenderer.useFloatFBO`), losing precision for temporal effects like `decay`/`accumulation`/`diffusion`.

## Adding a New Node
1. Optional: add GLSL helper in `src/nodes/glsl/yourHelper.ts` (export a `string` constant).
2. Register in `src/nodes/NodeTypes.ts` via `registry.register('your_node', { ... })`.
3. Wire into a graph preset in `src/data/presets.ts` or `src/ui/Playground.tsx`.
4. The compiler handles topo-sort, uniform declaration, and dependency injection automatically.

## Path Alias
`@/*` resolves to `./src/*` (configured in `tsconfig.json`).
