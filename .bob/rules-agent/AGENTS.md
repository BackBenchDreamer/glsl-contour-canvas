# Project Coding Rules (Non-Obvious Only)

## Registration side-effect order matters
`src/nodes/index.ts` → `src/nodes/NodeTypes.ts` executes `registry.register()` calls as a side effect on import. The singleton `registry` in `src/engine/Registry.ts` must be populated before `compileGraph()` is called. If you add a new node file, re-export it from `src/nodes/NodeTypes.ts` (or `src/nodes/index.ts`), not standalone.

## `generateCode` contract differs by `inline`
- `inline: false` (default): return a **statement** string — the compiler wraps it with `  // Node: ...` comment and emits it verbatim inside `void main()`. Variable must be named `out_{node.id}`.
- `inline: true`: return a bare **expression** string (no trailing `;`, no variable assignment). The compiler substitutes this expression wherever the node's output is consumed.
- Temporal nodes (those reading `previousFrameTex`) must **not** be `inline` — the multi-line texture lookup code requires a statement block.

## Sampler uniforms are never in `getUniforms()`
Texture uniforms (`sampler2D`) declared in `uniformTypes` must **not** appear in `getUniforms()` — the renderer binds them directly by name at draw time. Only scalar/vector uniforms go in `getUniforms()`.

## Pass-boundary texture slot naming
For each `pass_boundary` node, the renderer expects a uniform named exactly `u_{passBoundaryNodeId}_passTex`. This is auto-declared by the compiler in `Compiler.ts` for the downstream pass. Do not manually declare this uniform.

## No test runner — validate by reading
There is no Jest/Vitest/any test framework. Validate logic changes by reading `Compiler.ts` and tracing the generated GLSL mentally. `npm run build` is the only automated check (TypeScript + ESLint).

## TypeScript path alias
Use `@/engine/...`, `@/renderer/...`, etc. — `@/*` maps to `src/*`. Do not use relative `../../` imports across directory boundaries.
