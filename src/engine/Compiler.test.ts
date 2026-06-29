/**
 * Compiler correctness tests
 *
 * These tests exercise src/engine/Compiler.ts (a pure TS function — no DOM, no WebGL)
 * against known graph shapes and assert on the structure of the emitted CompiledShader[].
 *
 * Covering:
 *  1. Single-pass graph → 1 CompiledShader, isFinal: true
 *  2. Two-pass graph → 2 CompiledShaders, correct isFinal flags
 *  3. Pass 0 declares _previousFrameTex uniform (feedback node)
 *  4. Pass 1 declares _passTex uniform for cross-pass read
 *  5. Pass 1 does NOT declare _previousFrameTex (no temporal nodes in Pass 1)
 *  6. Inline nodes produce no variable declaration in fragment GLSL
 *  7. Type mismatch emits console.warn (does not throw)
 *  8. Unknown node type throws
 *  9. GLSL dependencies are deduplicated across nodes in the same pass
 * 10. topological sort: node code appears in dependency order in void main()
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { compileGraph } from '../engine/Compiler';
import { GraphDef } from '../engine/Graph';

// Trigger node registration side-effect before any test runs.
// NodeTypes.ts calls registry.register() at module load time.
beforeAll(async () => {
  await import('../nodes');
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal single-pass graph: uv → noise_simplex → contour → color_map → output */
function singlePassGraph(): GraphDef {
  return {
    outputNodeId: 'out',
    nodes: [
      { id: 'uv',    type: 'uv',            params: {},                          inputs: {} },
      { id: 'noise', type: 'noise_simplex',  params: { scale: 3.0 },             inputs: { uv: { nodeId: 'uv' } } },
      { id: 'cont',  type: 'contour',        params: { frequency: 8, thickness: 0.1, smoothing: 0.02 }, inputs: { scalar: { nodeId: 'noise' } } },
      { id: 'col',   type: 'color_map',      params: { color1: [0,0,0], color2: [1,1,1] }, inputs: { mask: { nodeId: 'cont' } } },
      { id: 'out',   type: 'output',         params: {},                          inputs: { color: { nodeId: 'col' } } },
    ],
  };
}

/**
 * Two-pass flow-trails graph (mirrors buildFlowTrailsGraph in Playground.tsx).
 * Pass 0: feedback → transform(decayRate) + contour → transform(brightness) → math_add → pass_boundary
 * Pass 1: trail_buf (passTex) → transform → color_map → output
 */
function twoPassGraph(): GraphDef {
  return {
    outputNodeId: 'out',
    nodes: [
      // Pass 0
      { id: 'uv',           type: 'uv',           params: {},                                        inputs: {} },
      { id: 'time',         type: 'time',          params: { value: 0 },                             inputs: {} },
      { id: 'noise',        type: 'noise_simplex', params: { scale: 1.4 },                           inputs: { uv: { nodeId: 'uv' } } },
      { id: 'cont',         type: 'contour',       params: { frequency: 10, thickness: 0.08, smoothing: 0.015 }, inputs: { scalar: { nodeId: 'noise' } } },
      { id: 'trail_signal', type: 'transform',     params: { mult: 2.5, add: 0 },                   inputs: { scalar: { nodeId: 'cont' } } },
      { id: 'trail_fb',     type: 'feedback',      params: {},                                        inputs: { uv: { nodeId: 'uv' } } },
      { id: 'trail_decay',  type: 'transform',     params: { mult: 0.92, add: 0 },                  inputs: { scalar: { nodeId: 'trail_fb' } } },
      { id: 'trail_add',    type: 'math_add',      params: {},                                        inputs: { a: { nodeId: 'trail_decay' }, b: { nodeId: 'trail_signal' } } },
      { id: 'trail_buf',    type: 'pass_boundary', params: {},                                        inputs: { in: { nodeId: 'trail_add' } } },
      // Pass 1  (trail_buf must appear in nodes[] before these)
      { id: 'trail_norm',   type: 'transform',     params: { mult: 1.0, add: 0 },                   inputs: { scalar: { nodeId: 'trail_buf' } } },
      { id: 'col',          type: 'color_map',     params: { color1: [0,0,0], color2: [0,0.67,1] }, inputs: { mask: { nodeId: 'trail_norm' } } },
      { id: 'out',          type: 'output',        params: {},                                        inputs: { color: { nodeId: 'col' } } },
    ],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('compileGraph — single-pass', () => {
  it('returns exactly 1 CompiledShader', () => {
    const passes = compileGraph(singlePassGraph());
    expect(passes).toHaveLength(1);
  });

  it('the single pass is marked isFinal', () => {
    const [pass] = compileGraph(singlePassGraph());
    expect(pass.isFinal).toBe(true);
  });

  it('passId equals the outputNodeId', () => {
    const [pass] = compileGraph(singlePassGraph());
    expect(pass.passId).toBe('out');
  });

  it('emits #version 300 es fragment shader', () => {
    const [pass] = compileGraph(singlePassGraph());
    expect(pass.fragmentShader).toContain('#version 300 es');
  });

  it('declares uniforms for every non-sampler node param', () => {
    const [pass] = compileGraph(singlePassGraph());
    expect(pass.uniforms).toHaveProperty('u_noise_scale');
    expect(pass.uniforms).toHaveProperty('u_cont_frequency');
    expect(pass.uniforms).toHaveProperty('u_cont_thickness');
    expect(pass.uniforms).toHaveProperty('u_cont_smoothing');
    expect(pass.uniforms['u_noise_scale'].value).toBe(3.0);
  });

  it('includes snoise GLSL dependency in the fragment shader', () => {
    const [pass] = compileGraph(singlePassGraph());
    // snoise2D exports a string containing the function definition
    expect(pass.fragmentShader).toContain('float snoise(vec2 v)');
  });
});

describe('compileGraph — two-pass (flow trails)', () => {
  it('returns exactly 2 CompiledShaders', () => {
    const passes = compileGraph(twoPassGraph());
    expect(passes).toHaveLength(2);
  });

  it('Pass 0 is not final, Pass 1 is final', () => {
    const [p0, p1] = compileGraph(twoPassGraph());
    expect(p0.isFinal).toBe(false);
    expect(p1.isFinal).toBe(true);
  });

  it('Pass 0 passId is trail_buf, Pass 1 passId is out', () => {
    const [p0, p1] = compileGraph(twoPassGraph());
    expect(p0.passId).toBe('trail_buf');
    expect(p1.passId).toBe('out');
  });

  it('Pass 0 declares the feedback previousFrameTex sampler uniform', () => {
    const [p0] = compileGraph(twoPassGraph());
    // feedback node id = trail_fb → uniform u_trail_fb_previousFrameTex
    expect(p0.uniforms).toHaveProperty('u_trail_fb_previousFrameTex');
    expect(p0.uniforms['u_trail_fb_previousFrameTex'].type).toBe('sampler2D');
    expect(p0.fragmentShader).toContain('uniform sampler2D u_trail_fb_previousFrameTex');
  });

  it('Pass 1 declares the cross-pass passTex sampler uniform', () => {
    const [, p1] = compileGraph(twoPassGraph());
    // pass_boundary id = trail_buf → cross-pass uniform u_trail_buf_passTex
    expect(p1.uniforms).toHaveProperty('u_trail_buf_passTex');
    expect(p1.uniforms['u_trail_buf_passTex'].type).toBe('sampler2D');
    expect(p1.fragmentShader).toContain('uniform sampler2D u_trail_buf_passTex');
  });

  it('Pass 1 does NOT declare any _previousFrameTex uniform', () => {
    const [, p1] = compileGraph(twoPassGraph());
    const uniformNames = Object.keys(p1.uniforms);
    expect(uniformNames.some(n => n.endsWith('_previousFrameTex'))).toBe(false);
    expect(p1.fragmentShader).not.toContain('_previousFrameTex');
  });

  it('Pass 1 reads trail_buf via texture() call in GLSL', () => {
    const [, p1] = compileGraph(twoPassGraph());
    // getInputValue for trail_norm.scalar resolves to texture(u_trail_buf_passTex, baseUv).r
    expect(p1.fragmentShader).toContain('texture(u_trail_buf_passTex, baseUv).r');
  });

  it('Pass 0 contains the noise and contour code, Pass 1 does not', () => {
    const [p0, p1] = compileGraph(twoPassGraph());
    // snoise is only in the pass that uses it (Pass 0)
    expect(p0.fragmentShader).toContain('float snoise(vec2 v)');
    expect(p1.fragmentShader).not.toContain('float snoise(vec2 v)');
  });

  it('Pass 0 emits fragColor for the pass_boundary output', () => {
    const [p0] = compileGraph(twoPassGraph());
    // Non-final pass_boundary emits: fragColor = vec4(val, val, val, 1.0)
    expect(p0.fragmentShader).toContain('fragColor = vec4(');
  });
});

describe('compileGraph — inline nodes', () => {
  it('inline node (transform) does not emit an out_ variable declaration', () => {
    // transform is inline:true — its code is substituted as an expression,
    // so void main() should NOT contain "float out_trail_signal ="
    const [p0] = compileGraph(twoPassGraph());
    expect(p0.fragmentShader).not.toContain('float out_trail_signal');
  });

  it('inline node (math_add) does not emit an out_ variable declaration', () => {
    const [p0] = compileGraph(twoPassGraph());
    expect(p0.fragmentShader).not.toContain('float out_trail_add');
  });

  it('non-inline node (contour) DOES emit an out_ variable declaration', () => {
    const [p0] = compileGraph(twoPassGraph());
    expect(p0.fragmentShader).toContain('out_cont');
  });
});

describe('compileGraph — GLSL dependency deduplication', () => {
  it('snoise appears exactly once in a pass that uses it twice', () => {
    // Build a graph where two nodes both depend on snoise2D
    // noise_simplex and noise_fbm both list snoise2D in glslDependencies
    const graph: GraphDef = {
      outputNodeId: 'out',
      nodes: [
        { id: 'uv',   type: 'uv',           params: {},                inputs: {} },
        { id: 'sn',   type: 'noise_simplex', params: { scale: 2 },    inputs: { uv: { nodeId: 'uv' } } },
        { id: 'fbm',  type: 'noise_fbm',     params: { scale: 3, octaves: 2 }, inputs: { uv: { nodeId: 'uv' } } },
        { id: 'add',  type: 'math_add',      params: {},               inputs: { a: { nodeId: 'sn' }, b: { nodeId: 'fbm' } } },
        { id: 'cont', type: 'contour',       params: { frequency: 8, thickness: 0.1, smoothing: 0.02 }, inputs: { scalar: { nodeId: 'add' } } },
        { id: 'col',  type: 'color_map',     params: { color1: [0,0,0], color2: [1,1,1] }, inputs: { mask: { nodeId: 'cont' } } },
        { id: 'out',  type: 'output',        params: {},               inputs: { color: { nodeId: 'col' } } },
      ],
    };
    const [pass] = compileGraph(graph);
    // Count occurrences of the snoise function definition
    const matches = pass.fragmentShader.match(/float snoise\(vec2 v\)/g);
    expect(matches).toHaveLength(1);
  });
});

describe('compileGraph — type validation', () => {
  it('emits console.warn on FieldType mismatch (does not throw)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Wire a Vector2 output (uv node) into a port expecting Scalar — type mismatch
    const graph: GraphDef = {
      outputNodeId: 'out',
      nodes: [
        { id: 'uv',   type: 'uv',      params: {},          inputs: {} },
        // contour.scalar expects StaticScalar|DynamicScalar, but uv outputs Vector2
        { id: 'cont', type: 'contour', params: { frequency: 8, thickness: 0.1, smoothing: 0.02 }, inputs: { scalar: { nodeId: 'uv' } } },
        { id: 'col',  type: 'color_map', params: { color1: [0,0,0], color2: [1,1,1] }, inputs: { mask: { nodeId: 'cont' } } },
        { id: 'out',  type: 'output',  params: {},          inputs: { color: { nodeId: 'col' } } },
      ],
    };
    expect(() => compileGraph(graph)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Type mismatch'));
    warn.mockRestore();
  });
});

describe('compileGraph — error cases', () => {
  it('throws on unknown node type', () => {
    const graph: GraphDef = {
      outputNodeId: 'out',
      nodes: [
        { id: 'uv',  type: 'uv',              params: {}, inputs: {} },
        { id: 'bad', type: 'nonexistent_node', params: {}, inputs: { uv: { nodeId: 'uv' } } },
        { id: 'out', type: 'output',           params: {}, inputs: { color: { nodeId: 'bad' } } },
      ],
    };
    expect(() => compileGraph(graph)).toThrow(/not registered/);
  });

  it('throws on reference to missing node id', () => {
    const graph: GraphDef = {
      outputNodeId: 'out',
      nodes: [
        { id: 'uv',  type: 'uv',    params: {}, inputs: {} },
        { id: 'out', type: 'output', params: {}, inputs: { color: { nodeId: 'ghost_node' } } },
      ],
    };
    // The type-validation loop throws when it finds a dangling nodeId reference.
    // (visit() in topological sort silently skips the missing node, but the
    // validation pass at the top of compileGraph catches it first and throws.)
    expect(() => compileGraph(graph)).toThrow(/references missing node ghost_node/);
  });
});
