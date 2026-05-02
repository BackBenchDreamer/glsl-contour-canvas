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
- **6 built-in presets** — Topographic, Domain Warp, Minimal, Neon, Inferno, Glitch — each swapping the full node graph configuration
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
