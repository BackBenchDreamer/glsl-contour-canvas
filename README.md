# Node-Based Field Processing Engine

This project is a high-performance **real-time field processing engine** with node-based composition for procedural and data-driven contour generation.

Unlike traditional fixed-pipeline or linear shaders disguised as a graph, this engine treats rendering as a strict **Directed Acyclic Graph (DAG)** of typed field transformations (`ScalarField`, `VectorField`), explicitly supporting non-linear topologies like branching, merging, blending, and masking.

## Core Architecture

The system is separated into logical layers:
- **/engine**: Handles graph topologies, strict FieldType validation, topological sorting, and **multi-pass** dynamic GLSL compilation. It deeply optimizes shaders by deduplicating GLSL dependencies, tracking field types, and intelligently inlining trivial math operations. When passing field data across frames or stages, it partitions the graph and compiles multiple independent shader programs.
- **/nodes**: Defines the domain-specific operations:
  - **Temporal**: `feedback`, `decay`, `accumulation`, `diffusion`
  - **Spatial**: Simplex/FBM Noise, Domain Warping, Transforms
  - **Compositing**: Multi-Input Blends, Mixers, Contour Extraction, Color Mapping
- **/renderer**: A high-performance WebGL2 wrapper equipped with **Ping-Pong Framebuffers**. It seamlessly handles multi-pass execution, injecting previous-frame states to simulate evolving dynamical systems (like Reaction-Diffusion) across frames.
- **/ui**: The host environment showcasing live node topology and property controls.

## Features

- **Procedural Art Generation**: Construct intricate patterns using multi-layer noise and domain warping.
- **Node-Based Pipeline**: Swap out algorithms or add new math nodes without rewriting monolithic shaders.
- **Real-Time Playground**: Interactive controls (via Leva) allow you to tweak node properties instantly without recompiling the shader, running at a fluid 60 FPS.
- **Dynamic GLSL Compilation**: The engine only includes the dependencies and nodes actually used in your graph.

## Extending the Engine

### Data-Driven Contours (External Scalar Fields)
The node graph can easily be extended to support data-driven visualizations. By registering a `data_field` node, you can feed an external texture or buffer (e.g., parsed from a CSV file) directly into the node pipeline:

```ts
registry.register('data_field', {
  name: 'Data Field (CSV/Grid)',
  generateCode: (node, getInput) => {
    const uv = getInput('uv');
    return `float out_${node.id} = texture(u_${node.id}_dataTex, ${uv}).r;`;
  }
});
```

You can then pipe the `out` of this data node into the `ContourNode` to generate topographic maps of real datasets.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the interactive Node Playground.
