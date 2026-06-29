# Project Architecture Rules (Non-Obvious Only)

## Compilation is fully stateless, rendering is stateful
`compileGraph()` in `Compiler.ts` is a pure function — same input always produces same `CompiledShader[]`. All mutable WebGL state (FBOs, programs, VAO, ping-pong index) lives exclusively in `WebGLRenderer`. Never move stateful WebGL operations into the compiler.

## Pass ordering is implicit — determined by graph topology
`pass_boundary` nodes are found by linear scan of `graph.nodes` array order. The order in which passes execute is determined by the **order `pass_boundary` nodes appear in the `nodes` array**, not by topological position. This is a non-obvious constraint when designing multi-pass graphs.

## Inline node limitation is architectural, not accidental
`inline: true` nodes emit their expression every time they are consumed — there is no CSE (common subexpression elimination). If a node has multiple downstream consumers, its computation runs multiple times in the shader. Simple math ops (`math_add`, `blend`, `mix`, `mask`, `transform`) are intentionally inline; stateful or expensive nodes must not be.

## Temporal nodes require renderer cooperation — not just compiler
`feedback`, `decay`, `accumulation`, `diffusion` nodes declare `previousFrameTex: sampler2D` in `uniformTypes`. The compiler emits the declaration; the **renderer** must bind the correct ping-pong texture to `u_{nodeId}_previousFrameTex` before each draw call. Adding a new temporal node requires changes in both `NodeTypes.ts` AND `WebGLRenderer.ts`.

## `FieldType` mismatch is a runtime hazard, not a build error
Type validation in the compiler is advisory (`console.warn` only). Invalid wiring silently generates malformed GLSL that fails at shader compile time inside WebGL — surfacing as a black canvas with no JS exception. Any new type system work must account for this.

## GLSL dependency deduplication is name-based
`glslDependencies` deduplication uses string identity (`Set<string>`). Two different GLSL snippets that define the same function name (e.g., `permute`) will be deduplicated to one — whichever string was first encountered — silently breaking the other. Plan GLSL helper function namespacing carefully.

## No abstraction layer for WebGL — direct API throughout
`WebGLRenderer.ts` uses the raw `WebGL2RenderingContext` API directly with no helper library. Any new rendering feature must follow this pattern. Do not introduce Three.js, TWGL, or similar.
