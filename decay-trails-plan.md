# Decay Trails Preset — Plan

## Status: COMPLETE ✓

All 5 sub-tasks implemented and verified. Build passes (TypeScript clean, no new lint errors).

---

## Overview

Add a 7th preset called **"Flow Trails"** that demonstrates the engine's multi-pass ping-pong
framebuffer capability — the feature most distinctive to this project's architecture but
currently invisible in the live demo.

Additive formula per pixel: `out = prev_frame × decayRate + contour_signal × trailBrightness`

---

## Sub-Tasks

### Sub-Task 1 — Make `buildAndCompile` topology-aware
**Status:** `[x] done`

- `buildSinglePassGraph(controls)` extracted — all 6 existing presets use this unchanged.
- `buildFlowTrailsGraph(controls)` added — two-pass graph with `pass_boundary: trail_buf` node
  positioned in the array before Pass-1 nodes (required by Compiler.ts linear scan).
- `buildAndCompile(controls, presetId)` branches on `presetId === 'flow-trails'`.
- Both `useEffect` call sites updated to pass `activePresetId`.
- Used `feedback` node (not `decay`) to read previous frame — avoids `max()` semantics.
  Composed additive accumulation from existing inline nodes:
  `feedback → transform(×decayRate) + transform(×trailBrightness) → math_add → pass_boundary`.

### Sub-Task 2 — Add Flow Trails Leva controls
**Status:** `[x] done`

- `useControls('Flow Trails', ...)` added with `decayRate` (0.92) and `trailBrightness` (2.5).
- `collapsed: !isFlowTrails` keeps the folder hidden/collapsed on all other presets.
- `flowControlsRef` and `activePresetIdRef` added for use in `onFrame`.
- `onFrame` branches on `activePresetIdRef.current === 'flow-trails'` to push
  `u_trail_signal_mult` and `u_trail_decay_mult` to the renderer each frame.

### Sub-Task 3 — Add the Flow Trails preset entry
**Status:** `[x] done`

Added to `src/data/presets.ts`. No type changes needed.
Defaults: noise scale 1.4 / fbmOctaves 3 / warp 0.6 / contour freq 10.0 thickness 0.08 /
colors `#000008` → `#00aaff` / timeSpeed 0.002.

### Sub-Task 4 — Wire `texelSize` / verify feedback node binding
**Status:** `[x] done — read-only verification, no code change needed`

- Chose `feedback` node (not `decay`), which declares only `previousFrameTex: 'sampler2D'`
  with no `getUniforms`. Renderer suffix check `name.endsWith('_previousFrameTex')` matches
  `u_trail_fb_previousFrameTex` and auto-binds the ping-pong read texture. ✓

### Sub-Task 5 — Validate two-pass graph in Compiler
**Status:** `[x] done — read-only trace, no bugs found`

- `passOutputs = ['trail_buf', 'out']` — correct order due to node array ordering.
- Pass 0 visit: collects full noise/warp/contour chain + feedback/decay nodes. ✓
- Pass 1 visit: stops at `trail_buf` (foreign boundary) → emits `uniform sampler2D u_trail_buf_passTex`. ✓
- `trail_norm.getInputValue('scalar')` resolves to `texture(u_trail_buf_passTex, baseUv).r`. ✓
- Build output: TypeScript clean, 0 new lint errors. ✓

---

## Notes resolved during implementation

- `decay` node uses `max()` semantics, not addition — used `feedback` + two `transform` nodes
  composed with `math_add` instead. All are `inline: true` so no extra variable declarations.
- `trail_norm` (transform mult=1.0) node added before `color_map` in Pass 1 as a normalisation
  knob; user can scale trail brightness via the Leva `trailBrightness` slider.
