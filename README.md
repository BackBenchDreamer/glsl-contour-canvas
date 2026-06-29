# Node Contour Engine

![WebGL2](https://img.shields.io/badge/WebGL2-Ready-00ffcc?style=flat-square&logo=webgl)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

> A browser-native GLSL compiler that takes a typed node graph as input and emits optimized WebGL2 shader programs in real time — with ping-pong framebuffers for temporal effects and strict DAG validation to prevent invalid field compositions.

**[Live Demo →](https://glsl-contour-canvas.vercel.app/)**

---

## What it does

You define a graph of typed field transformations — noise generators, domain warps, contour extractors, color maps — and the engine compiles them into optimized GLSL fragment shaders at runtime. Change a parameter? The DAG recompiles, the shader updates, and you see the result at 60fps. No page reload. No manual shader code.

## Key features

- **Dynamic multi-pass GLSL compilation** — the engine only includes nodes and GLSL dependencies actually used in your graph, deduplicating shared functions
- **Ping-pong framebuffers** — temporal effects (decay, diffusion, accumulation, reaction-diffusion) that feed previous frame data back into the current frame via double-buffered FBOs
- **Typed DAG with strict validation** — every edge is checked against `FieldType` constraints (`StaticScalar`, `DynamicScalar`, `Vector2`, `Vector3`, `Sampler2D`); cycles and type mismatches are caught at compile time
- **7 built-in presets** — Topographic, Domain Warp, Minimal, Neon, Inferno, Glitch, Flow Trails — each swapping the full node graph configuration; Flow Trails uses a two-pass ping-pong graph
- **Live node graph visualization** — read-only SVG rendering of the executing DAG with animated data-flow edges
- **Frame export & GLSL copy** — save the current canvas as PNG or copy the compiled fragment shader to your clipboard

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    GraphDef (JSON)                    │
│  nodes: [{id, type, params, inputs}]                 │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│              engine/Compiler.ts                      │
│  1. FieldType validation at every edge               │
│  2. Partition at pass_boundary nodes                 │
│  3. Topological sort per pass                        │
│  4. GLSL codegen with dependency deduplication       │
│  5. Emit CompiledShader[] (vertex + fragment + meta) │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│           renderer/WebGLRenderer.ts                  │
│  • Compiles & links WebGL2 programs                  │
│  • Creates ping-pong FBOs (RGBA32F / RGBA8 fallback) │
│  • Multi-pass render loop at 60fps                   │
│  • Injects previous-frame textures for temporal FX   │
└──────────────────────────────────────────────────────┘
```

### Node types

| Category | Nodes | Output |
|----------|-------|--------|
| **Source** | `uv`, `time` | Vector2, Scalar |
| **Noise** | `noise_simplex`, `noise_fbm` | StaticScalar |
| **Spatial** | `warp`, `transform` | Vector2, Scalar |
| **Compositing** | `math_add`, `blend`, `mix`, `mask` | Scalar |
| **Extraction** | `contour` | StaticScalar |
| **Color** | `color_map` | Vector3 |
| **Temporal** | `feedback`, `decay`, `accumulation`, `diffusion` | DynamicScalar |
| **Structure** | `pass_boundary`, `output`, `data_field` | Various |

---

## Math notes

The visual output of this engine rests on four mathematical operations composed in sequence. This section explains what each one does, why the implementation choices were made, and how the parameters map to the geometry you see.

### 1. Simplex noise — `src/nodes/glsl/snoise2D.ts`

Simplex noise ([Perlin 2001](https://www.cs.utexas.edu/~fussell/courses/cs384g-fall2013/lectures/noise/Simplex%20Noise%20Evaluator%20Program.pdf), optimised GLSL by Ian McEwan) produces a smooth scalar field over ℝ² with no directional bias and a known frequency spectrum.

The field value at point **v** is:

```
f(v) = 130 · Σᵢ max(0, 0.5 − |xᵢ|²)⁴ · (aᵢ·xᵢ + hᵢ·xᵢ_perp)
```

where the sum is over the 3 simplex corners nearest to **v**, `aᵢ` and `hᵢ` are gradient components derived from a permutation hash, and the `130` constant normalises output to roughly `[−1, 1]`.

**Why simplex over classic Perlin?** The simplex lattice is triangular in 2D, so each point has exactly 3 corner contributions instead of 4, and the gradient directions have no axial alignment artifacts. The result is a rotationally isotropic field — contour lines don't show a preferred horizontal or vertical orientation.

**Parameter effect:**
- `scale` — multiplies UV before evaluation: `snoise(uv * scale)`. Higher scale = higher spatial frequency = more contour lines per screen unit.
- The output is in `[−1, 1]`; downstream nodes expect `[0, 1]`, so `fract()` in the contour node handles the wrap.

---

### 2. Fractional Brownian Motion (fBM) — `src/nodes/glsl/fbm.ts`

fBM stacks `n` octaves of simplex noise at geometrically increasing frequencies and decreasing amplitudes:

```
fbm(x, n) = Σₖ₌₀ⁿ⁻¹  (1/2)ᵏ · snoise(Rᵏ · 2ᵏ · x + kΔ)
```

where `R` is a 2D rotation matrix (angle 0.5 rad) applied between octaves and `Δ = (100, 100)` is a spatial offset that breaks the lattice correlation between successive octaves.

**Amplitude spectrum:** Each octave contributes half the amplitude of the previous, so the total variance sums to `≤ 1` (geometric series: `Σ(1/2)ᵏ → 1`). This gives fBM its characteristic self-similar, fractal-like appearance — fine detail is present but subordinate to the coarse structure.

**Why rotate between octaves?** Without rotation, successive octaves are evaluated along the same axes. The rotation de-correlates them, producing a more isotropic, organic result and reducing the "grid" artifact visible in naive octave stacking.

**Parameter effects:**
- `fbmOctaves` — number of octaves stacked. 1 = smooth single-frequency field; 8 = dense, fractal-like texture. Each additional octave roughly doubles visual complexity while halving its contribution. Above 5–6 octaves the visual improvement is imperceptible (contributions `< 0.03`).
- `scale` — spatial frequency of the base octave. Higher values stretch the pattern toward finer detail.

The fBM field is used here not as the final noise source but as the **warp field** — its output drives domain warping of the primary simplex noise.

---

### 3. Domain warping — `src/nodes/NodeTypes.ts` (`warp` node)

Domain warping ([Quilez 2002](https://iquilezles.org/articles/warp/)) evaluates noise at a position displaced by another noise field:

```
f_warped(p) = snoise(p + intensity · w(p))
```

where `w(p)` is the fBM warp field evaluated at the original position `p`. This folds the noise field back on itself, producing the characteristic "marble" or "flowing ink" look — contour lines that appear to pull and swirl rather than drift uniformly.

**Two-level warping:** The implementation uses a separate time offset (`warp_time = time × 0.6 + 5.2`) for the warp field vs the main noise (`time × noiseTimeScale`). This means the warp motion and the noise motion are at different temporal rates and phases, preventing the visual lockstep where everything moves together.

**Parameter effects:**
- `intensity` — the displacement magnitude in UV space. At 0 there is no warp; the noise field drifts cleanly. Around 0.3–0.6 the field acquires organic curvature. Above 1.0 the warp begins to fold completely, producing interference patterns.
- `warpScale` — the spatial frequency of the warp noise. High values produce tight, jittery warp; low values produce broad, sweeping distortions.

---

### 4. Contour extraction — `src/nodes/NodeTypes.ts` (`contour` node)

Contour lines are isocurves — the set of points where `f(p) = c` for some constant `c`. The GLSL implementation generates a whole family of them simultaneously using `fract()`:

```
v    = fract(f · frequency)          // tile the scalar field: [0,1] repeating
line = smoothstep(t + σ, t, v)       // 1 inside the band [0, t], 0 outside, smooth transition width σ
```

**Why `fract()` instead of explicit isolevel checks?** Applying `fract()` maps the continuous scalar field to a sawtooth wave with period `1/frequency`. Each period contains exactly one contour band of width `thickness / frequency`. This generates all contour lines in a single expression with no loops — O(1) cost regardless of frequency.

**Anti-aliasing via `smoothstep`:** The transition from 0 to 1 happens over a width `smoothing` in UV space. Without this, contour lines would be 1-pixel-wide aliased edges. The `smoothstep` creates a soft falloff that acts as a sub-pixel anti-alias, controlled independently from line thickness.

**Parameter effects:**
- `frequency` — contour lines per noise unit. At 8, there are 8 evenly-spaced isolevels across the noise range. Higher frequency = denser lines = topographic-map look.
- `thickness` — fractional width of each line relative to the period. At 0.1, each line occupies 10% of its band. Thin lines emphasise the field structure; thick lines fill the space.
- `smoothing` — softness of the line edge in the same units as thickness. Matched to pixel density it provides analytical anti-aliasing; increased deliberately it creates a glowing, diffuse appearance.

---

### 5. Temporal feedback — `src/renderer/WebGLRenderer.ts` + `src/nodes/NodeTypes.ts`

The **Flow Trails** preset uses a two-pass ping-pong framebuffer to accumulate motion history:

```
buffer[t] = buffer[t−1] × decayRate  +  contour(p, t) × trailBrightness
```

This is an exponentially-weighted moving average of the contour signal. The decay factor `r ∈ [0, 1)` determines the memory time constant:

```
τ = −1 / log(r)   frames        (e.g. r = 0.92 → τ ≈ 12 frames)
```

After `τ` frames, a pixel's contribution has decayed to `1/e ≈ 37%` of its original value. At 60fps, `r = 0.92` gives a ~200ms persistence tail — long enough to see the flow direction, short enough to track current motion.

**Stability condition:** The buffer is stable as long as `trailBrightness × max(contour) + decayRate ≤ 1`. Since `contour ∈ [0,1]`, this means `trailBrightness + decayRate ≤ 1` at maximum signal. In practice values above this cause the buffer to saturate (all white); reducing `trailBrightness` or `decayRate` brings it back into range. The `RGBA32F` float FBO allows accumulation above 1.0 without clipping, which is why `trail_norm` (a passthrough `transform` node) sits before `color_map` — it can scale down an overdriven buffer without losing the relative intensities.

---

## Quick start

```bash
git clone https://github.com/BackBenchDreamer/glsl-contour-canvas.git
cd glsl-contour-canvas
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll see:
- Full-screen animated contour canvas
- HUD panel (top-left) explaining the engine
- Leva control panel (top-right) with annotated sliders
- Preset switcher (bottom) to explore different configurations
- Node graph toggle (right edge) to see the live DAG

---

## Extending the engine

### Example: Add a Voronoi noise node

**Step 1** — Write the GLSL helper:

```ts
// src/nodes/glsl/voronoi.ts
export const voronoi = `
vec2 voronoiHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float voronoi(vec2 x, float scale) {
  vec2 p = x * scale;
  vec2 i = floor(p);
  vec2 f = fract(p);
  float minDist = 1.0;
  for (int j = -1; j <= 1; j++) {
    for (int k = -1; k <= 1; k++) {
      vec2 neighbor = vec2(float(j), float(k));
      vec2 point = voronoiHash(i + neighbor);
      vec2 diff = neighbor + point - f;
      minDist = min(minDist, dot(diff, diff));
    }
  }
  return sqrt(minDist);
}
`;
```

**Step 2** — Register the node:

```ts
// In src/nodes/NodeTypes.ts
import { voronoi } from './glsl/voronoi';

registry.register('noise_voronoi', {
  name: 'Voronoi Noise',
  inputs: { uv: FieldType.Vector2 },
  outputType: FieldType.StaticScalar,
  glslDependencies: [voronoi],
  uniformTypes: { scale: 'float' },
  getUniforms: (node) => ({ scale: node.params.scale ?? 5.0 }),
  generateCode: (node, getInput) => {
    return `float out_${node.id} = voronoi(${getInput('uv')}, u_${node.id}_scale);`;
  },
});
```

**Step 3** — Wire it into a graph:

```ts
{ id: 'voronoi', type: 'noise_voronoi', params: { scale: 8.0 }, inputs: { uv: { nodeId: 'uv' } } },
```

The compiler handles topological sort, uniform declaration, and GLSL dependency injection automatically.

### Example: Wire in a CSV heat map

Use the existing `data_field` node type. Upload your CSV as a texture via the WebGL API:

```ts
// Create a Float32Array from your CSV grid
const data = new Float32Array(csvValues);
const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, data);
// ... then bind to the data_field node's uniform
```

---

## License

MIT
