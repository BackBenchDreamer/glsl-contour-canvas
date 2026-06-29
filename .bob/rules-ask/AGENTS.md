# Project Documentation Context (Non-Obvious Only)

## CLAUDE.md is the primary architecture reference
`CLAUDE.md` contains the full compilation pipeline diagram, all field type semantics, file map with hot/safe/internal classifications, known gotchas, and a step-by-step "Adding a New Node" guide. Read it before answering any architectural question.

## "engine" ≠ rendering engine
`src/engine/` contains only the **compiler** (DAG → GLSL text). The actual WebGL draw loop, framebuffer management, and uniform dispatch are in `src/renderer/`. These are intentionally separate.

## `src/nodes/glsl/*.ts` are TypeScript files exporting GLSL strings
Despite `.ts` extension, `snoise2D.ts` and `fbm.ts` export raw GLSL function source as template literals. They are not executed — they are injected verbatim into fragment shaders.

## Leva is the only UI control library
Runtime parameter controls (sliders, color pickers) are driven entirely by `leva` (`src/ui/Playground.tsx`). There is no Redux, Zustand, or React Context for state — Leva manages it locally.

## No routing — single-page app
`src/app/page.tsx` renders a single `<Playground>` component. There is no routing beyond Next.js App Router's root page.

## "pass_boundary" is not a visual node in the UI
Despite being registered as a node type like any other, `pass_boundary` is a compiler directive — it tells the compiler to split at that point and create a new shader program + framebuffer. It does not render anything visible itself.
