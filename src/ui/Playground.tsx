"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Leva, useControls } from 'leva';
import { EngineCanvas } from '../renderer/EngineCanvas';
import { GraphDef } from '../engine/Graph';
import { compileGraph, CompiledShader } from '../engine/Compiler';
import { HUD } from '../components/HUD';
import { PresetSwitcher } from '../components/PresetSwitcher';
import { NodeGraphPanel } from '../components/NodeGraphPanel';
import { RightSidebar } from '../components/RightSidebar';
import { CompileBadge } from '../components/CompileBadge';
import { ErrorPanel } from '../components/ErrorPanel';
import { ExportButtons } from '../components/ExportButtons';
import { PRESETS, PresetConfig } from '../data/presets';
import '../nodes';

// Smoothing factor for temporal interpolation of uniform changes
const UNIFORM_SMOOTH_FACTOR = 0.05;
const ZEN_TOOLTIP_KEY = 'zen-tooltip-seen';

// ─── Graph builders ──────────────────────────────────────────────────────────

function buildSinglePassGraph(controls: PresetConfig['controls']): GraphDef {
  return {
    outputNodeId: 'out',
    nodes: [
      { id: 'uv', type: 'uv', params: {}, inputs: {} },
      { id: 'time', type: 'time', params: { value: 0.0 }, inputs: {} },
      // Scaled time for noise sampling (slower drift)
      {
        id: 'time_scaled', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale, add: 0.0 },
        inputs: { scalar: { nodeId: 'time' } },
      },
      // Separate warp time at a different rate for organic feel
      {
        id: 'warp_time', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale * 0.6, add: 5.2 },
        inputs: { scalar: { nodeId: 'time' } },
      },
      // FBM noise for warping — uses warp_time offset for temporal variation
      {
        id: 'warp_fbm', type: 'noise_fbm',
        params: { octaves: controls.noise.fbmOctaves, scale: controls.warp.warpScale, offset: [0, 0] },
        inputs: { uv: { nodeId: 'uv' } },
      },
      // Add warp_time to warp FBM for temporal domain warping
      {
        id: 'warp_animated', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'warp_fbm' }, b: { nodeId: 'warp_time' } },
      },
      // Domain warp using time-animated warp field
      {
        id: 'warp', type: 'warp',
        params: { intensity: controls.warp.intensity },
        inputs: { uv: { nodeId: 'uv' }, warpField: { nodeId: 'warp_animated' } },
      },
      // Main noise through warped UV
      {
        id: 'main_noise', type: 'noise_simplex',
        params: { scale: controls.noise.scale, offset: [0, 0] },
        inputs: { uv: { nodeId: 'warp' } },
      },
      // Animate by adding scaled time
      {
        id: 'animated', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'main_noise' }, b: { nodeId: 'time_scaled' } },
      },
      // Contour
      {
        id: 'contour', type: 'contour',
        params: {
          frequency: controls.contour.frequency,
          thickness: controls.contour.thickness,
          smoothing: controls.contour.smoothing,
        },
        inputs: { scalar: { nodeId: 'animated' } },
      },
      // Color
      {
        id: 'color', type: 'color_map',
        params: { color1: controls.colors.background, color2: controls.colors.contour_color },
        inputs: { mask: { nodeId: 'contour' } },
      },
      { id: 'out', type: 'output', params: {}, inputs: { color: { nodeId: 'color' } } },
    ],
  };
}

/**
 * Neon rainbow graph — single pass.
 *
 * Same noise/warp chain as single-pass, but colourisation uses rainbow_color_map:
 *   field input = raw animated noise value (drives hue per elevation band)
 *   mask input  = contour extraction output (gates brightness — lines lit, gaps dark)
 *
 * hueShift uniform is pushed every frame by onFrame to cycle the palette over time.
 */
function buildNeonGraph(controls: PresetConfig['controls']): GraphDef {
  return {
    outputNodeId: 'out',
    nodes: [
      { id: 'uv',   type: 'uv',   params: {}, inputs: {} },
      { id: 'time', type: 'time', params: { value: 0.0 }, inputs: {} },

      {
        id: 'time_scaled', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale, add: 0.0 },
        inputs: { scalar: { nodeId: 'time' } },
      },
      {
        id: 'warp_time', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale * 0.6, add: 5.2 },
        inputs: { scalar: { nodeId: 'time' } },
      },
      {
        id: 'warp_fbm', type: 'noise_fbm',
        params: { octaves: controls.noise.fbmOctaves, scale: controls.warp.warpScale, offset: [0, 0] },
        inputs: { uv: { nodeId: 'uv' } },
      },
      {
        id: 'warp_animated', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'warp_fbm' }, b: { nodeId: 'warp_time' } },
      },
      {
        id: 'warp', type: 'warp',
        params: { intensity: controls.warp.intensity },
        inputs: { uv: { nodeId: 'uv' }, warpField: { nodeId: 'warp_animated' } },
      },
      {
        id: 'main_noise', type: 'noise_simplex',
        params: { scale: controls.noise.scale, offset: [0, 0] },
        inputs: { uv: { nodeId: 'warp' } },
      },
      // Animated noise field — used as BOTH the field (hue source) and the contour input
      {
        id: 'animated', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'main_noise' }, b: { nodeId: 'time_scaled' } },
      },
      {
        id: 'contour', type: 'contour',
        params: {
          frequency: controls.contour.frequency,
          thickness: controls.contour.thickness,
          smoothing: controls.contour.smoothing,
        },
        inputs: { scalar: { nodeId: 'animated' } },
      },
      // Rainbow colour: hue driven by noise field value, brightness gated by contour mask.
      // hueShift (0.0 default) is pushed each frame by onFrame → u_rainbow_hueShift.
      {
        id: 'rainbow', type: 'rainbow_color_map',
        params: { hueShift: 0.0, hueRange: 0.85, saturation: 1.0, brightness: 1.0 },
        inputs: { field: { nodeId: 'animated' }, mask: { nodeId: 'contour' } },
      },
      { id: 'out', type: 'output', params: {}, inputs: { color: { nodeId: 'rainbow' } } },
    ],
  };
}

/**
 * Inferno graph — single pass, heat_map colourisation.
 *
 * The raw FBM noise field is fed into heat_map as the terrain colour source,
 * producing the full 4-stop ramp across the noise surface.
 * A separate, denser contour extraction overlays bright hot lines on top.
 * Two independent warp layers (different scales/phases) make the terrain
 * heave and fold like cooling magma rather than drifting uniformly.
 *
 * Key differentiators from Domain Warp:
 *  - Heat ramp (not two-colour mix) — background has colour, not just black
 *  - FBM with 6 octaves for dense terrain detail
 *  - Two warp layers at very different scales for irregular folding
 *  - Dense high-frequency contours (freq 20) with thin lines so glow dominates
 *  - Very slow animation so the terrain feels geological, not fluid
 */
function buildInfernoGraph(controls: PresetConfig['controls']): GraphDef {
  return {
    outputNodeId: 'out',
    nodes: [
      { id: 'uv',   type: 'uv',   params: {}, inputs: {} },
      { id: 'time', type: 'time', params: { value: 0.0 }, inputs: {} },

      // Slow geological time
      {
        id: 'time_scaled', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale, add: 0.0 },
        inputs: { scalar: { nodeId: 'time' } },
      },

      // ── Large-scale warp (broad magma chambers) ───────────────────────────
      {
        id: 'warp_fbm_large', type: 'noise_fbm',
        params: { octaves: 3, scale: 1.4, offset: [0, 0] },
        inputs: { uv: { nodeId: 'uv' } },
      },
      {
        id: 'warp_time_large', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale * 0.4, add: 12.7 },
        inputs: { scalar: { nodeId: 'time' } },
      },
      {
        id: 'warp_large_anim', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'warp_fbm_large' }, b: { nodeId: 'warp_time_large' } },
      },
      {
        id: 'warp_large', type: 'warp',
        params: { intensity: controls.warp.intensity * 0.7 },
        inputs: { uv: { nodeId: 'uv' }, warpField: { nodeId: 'warp_large_anim' } },
      },

      // ── Fine-scale warp (surface cracking, fissures) ──────────────────────
      {
        id: 'warp_fbm_fine', type: 'noise_fbm',
        params: { octaves: 4, scale: controls.warp.warpScale, offset: [0, 0] },
        inputs: { uv: { nodeId: 'warp_large' } },
      },
      {
        id: 'warp_time_fine', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale * 0.8, add: 3.3 },
        inputs: { scalar: { nodeId: 'time' } },
      },
      {
        id: 'warp_fine_anim', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'warp_fbm_fine' }, b: { nodeId: 'warp_time_fine' } },
      },
      {
        id: 'warp_fine', type: 'warp',
        params: { intensity: controls.warp.intensity * 0.4 },
        inputs: { uv: { nodeId: 'warp_large' }, warpField: { nodeId: 'warp_fine_anim' } },
      },

      // ── Terrain FBM (6 octaves for dense topographic detail) ──────────────
      {
        id: 'terrain', type: 'noise_fbm',
        params: { octaves: controls.noise.fbmOctaves, scale: controls.noise.scale, offset: [0, 0] },
        inputs: { uv: { nodeId: 'warp_fine' } },
      },
      // Animated terrain field
      {
        id: 'terrain_anim', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'terrain' }, b: { nodeId: 'time_scaled' } },
      },

      // ── Contour lines — dense, very thin, wide glow ───────────────────────
      {
        id: 'contour', type: 'contour',
        params: {
          frequency: controls.contour.frequency,
          thickness: controls.contour.thickness,
          smoothing: controls.contour.smoothing,
        },
        inputs: { scalar: { nodeId: 'terrain_anim' } },
      },

      // ── Heat map colourisation — terrain field drives ramp, contour overlays
      {
        id: 'color', type: 'heat_map',
        params: { fieldBias: 0.35, lineBoost: 3.0 },
        inputs: { field: { nodeId: 'terrain_anim' }, mask: { nodeId: 'contour' } },
      },
      { id: 'out', type: 'output', params: {}, inputs: { color: { nodeId: 'color' } } },
    ],
  };
}

/**
 * Glitch graph — single pass, dual-noise interference.
 *
 * Two simplex noise fields at very different spatial scales are multiplied
 * together (blend op:'mult'). The product is near-zero wherever either field
 * crosses zero — which produces a grid of sharp dark gaps between bright bands,
 * the signature digital-glitch interference pattern.
 *
 * Extreme low-scale warp (large-feature displacement) then tears this grid
 * apart in sweeping waves. The warp is applied BEFORE the second noise
 * evaluation so the two fields decohere spatially as they animate.
 *
 * Key differentiators:
 *  - Two noise fields multiplied — creates sharp zeros, not gradients
 *  - Warp at large spatial scale (warpScale 0.8) = broad tearing bands
 *  - Very high warp intensity (2.8) = topology fully inverted in places
 *  - Fast animation (high timeSpeed) with different rates per layer
 *  - High contour frequency (22) over the interference signal
 */
function buildGlitchGraph(controls: PresetConfig['controls']): GraphDef {
  return {
    outputNodeId: 'out',
    nodes: [
      { id: 'uv',   type: 'uv',   params: {}, inputs: {} },
      { id: 'time', type: 'time', params: { value: 0.0 }, inputs: {} },

      // Fast primary time
      {
        id: 'time_fast', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale, add: 0.0 },
        inputs: { scalar: { nodeId: 'time' } },
      },
      // Slower secondary time (different phase = fields decohere over time)
      {
        id: 'time_slow', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale * 0.37, add: 99.1 },
        inputs: { scalar: { nodeId: 'time' } },
      },

      // ── Large-feature warp (sweeping glitch tears) ────────────────────────
      {
        id: 'warp_src', type: 'noise_fbm',
        params: { octaves: 2, scale: controls.warp.warpScale, offset: [0, 0] },
        inputs: { uv: { nodeId: 'uv' } },
      },
      {
        id: 'warp_src_anim', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'warp_src' }, b: { nodeId: 'time_fast' } },
      },
      {
        id: 'warp', type: 'warp',
        params: { intensity: controls.warp.intensity },
        inputs: { uv: { nodeId: 'uv' }, warpField: { nodeId: 'warp_src_anim' } },
      },

      // ── Field A: fine-grain simplex on warped UV ───────────────────────────
      {
        id: 'noise_a', type: 'noise_simplex',
        params: { scale: controls.noise.scale, offset: [0, 0] },
        inputs: { uv: { nodeId: 'warp' } },
      },
      {
        id: 'noise_a_anim', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'noise_a' }, b: { nodeId: 'time_fast' } },
      },

      // ── Field B: coarser simplex on un-warped UV (intentional decoherence) ─
      {
        id: 'noise_b', type: 'noise_simplex',
        params: { scale: controls.noise.scale * 0.45, offset: [50, 50] },
        inputs: { uv: { nodeId: 'uv' } },
      },
      {
        id: 'noise_b_anim', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'noise_b' }, b: { nodeId: 'time_slow' } },
      },

      // ── Multiply the two fields — near-zero at every zero-crossing ─────────
      {
        id: 'interference', type: 'blend',
        params: { op: 'mult' },
        inputs: { a: { nodeId: 'noise_a_anim' }, b: { nodeId: 'noise_b_anim' } },
      },

      // ── Contour over the interference signal ──────────────────────────────
      {
        id: 'contour', type: 'contour',
        params: {
          frequency: controls.contour.frequency,
          thickness: controls.contour.thickness,
          smoothing: controls.contour.smoothing,
        },
        inputs: { scalar: { nodeId: 'interference' } },
      },

      // ── Two-colour map: acid green/cyan on near-black ─────────────────────
      {
        id: 'color', type: 'color_map',
        params: { color1: controls.colors.background, color2: controls.colors.contour_color },
        inputs: { mask: { nodeId: 'contour' } },
      },
      { id: 'out', type: 'output', params: {}, inputs: { color: { nodeId: 'color' } } },
    ],
  };
}

/**
 * Two-pass flow-trails graph — revamped with dual warp layers.
 *
 * Pass 0 — trail buffer (ping-pong FBO, passId: 'trail_buf')
 *   Dual warp (large ×0.5 + fine ×0.3) → simplex → contour
 *   → trail_signal(brightness) + trail_decay(prev*rate) → pass_boundary
 *
 * Pass 1 — colorise (final)
 *   trail_buf → color_map → output
 *
 * IMPORTANT: pass_boundary node ('trail_buf') MUST appear in nodes[] array before
 * Pass-1 nodes (compiler linear scan, Compiler.ts lines 46–50).
 */
function buildFlowTrailsGraph(controls: PresetConfig['controls']): GraphDef {
  return {
    outputNodeId: 'out',
    nodes: [
      // ── PASS 0 nodes ───────────────────────────────────────────────────────

      { id: 'uv', type: 'uv', params: {}, inputs: {} },
      { id: 'time', type: 'time', params: { value: 0.0 }, inputs: {} },

      // Time scales
      {
        id: 'time_scaled', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale, add: 0.0 },
        inputs: { scalar: { nodeId: 'time' } },
      },

      // ── Large-scale warp (broad current sweeps) ───────────────────────────
      {
        id: 'warp_large_fbm', type: 'noise_fbm',
        params: { octaves: 3, scale: controls.warp.warpScale * 0.55, offset: [0, 0] },
        inputs: { uv: { nodeId: 'uv' } },
      },
      {
        id: 'warp_large_time', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale * 0.45, add: 7.3 },
        inputs: { scalar: { nodeId: 'time' } },
      },
      {
        id: 'warp_large_anim', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'warp_large_fbm' }, b: { nodeId: 'warp_large_time' } },
      },
      {
        id: 'warp_large', type: 'warp',
        params: { intensity: controls.warp.intensity * 0.5 },
        inputs: { uv: { nodeId: 'uv' }, warpField: { nodeId: 'warp_large_anim' } },
      },

      // ── Fine-scale warp (tight electric jitter) ───────────────────────────
      {
        id: 'warp_fine_fbm', type: 'noise_fbm',
        params: { octaves: controls.noise.fbmOctaves, scale: controls.warp.warpScale, offset: [0, 0] },
        inputs: { uv: { nodeId: 'warp_large' } },
      },
      {
        id: 'warp_fine_time', type: 'transform',
        params: { mult: controls.animation.noiseTimeScale * 0.9, add: 2.8 },
        inputs: { scalar: { nodeId: 'time' } },
      },
      {
        id: 'warp_fine_anim', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'warp_fine_fbm' }, b: { nodeId: 'warp_fine_time' } },
      },
      {
        id: 'warp_fine', type: 'warp',
        params: { intensity: controls.warp.intensity * 0.3 },
        inputs: { uv: { nodeId: 'warp_large' }, warpField: { nodeId: 'warp_fine_anim' } },
      },

      // ── Main noise + animate ───────────────────────────────────────────────
      {
        id: 'main_noise', type: 'noise_simplex',
        params: { scale: controls.noise.scale, offset: [0, 0] },
        inputs: { uv: { nodeId: 'warp_fine' } },
      },
      {
        id: 'animated', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'main_noise' }, b: { nodeId: 'time_scaled' } },
      },

      // Contour — tight thin lines, smoothing gives electric glow halo
      {
        id: 'contour', type: 'contour',
        params: {
          frequency: controls.contour.frequency,
          thickness: controls.contour.thickness,
          smoothing: controls.contour.smoothing,
        },
        inputs: { scalar: { nodeId: 'animated' } },
      },

      // Scale contour → trail_signal (trailBrightness pushed each frame)
      {
        id: 'trail_signal', type: 'transform',
        params: { mult: 2.0, add: 0.0 },
        inputs: { scalar: { nodeId: 'contour' } },
      },

      // Read previous frame (ping-pong) → decay
      {
        id: 'trail_fb', type: 'feedback',
        params: {},
        inputs: { uv: { nodeId: 'uv' } },
      },
      {
        id: 'trail_decay', type: 'transform',
        params: { mult: 0.93, add: 0.0 },
        inputs: { scalar: { nodeId: 'trail_fb' } },
      },

      // Additive combine: prev*rate + signal*brightness
      {
        id: 'trail_add', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'trail_decay' }, b: { nodeId: 'trail_signal' } },
      },

      // ── pass_boundary MUST be here — before Pass-1 nodes ─────────────────
      {
        id: 'trail_buf', type: 'pass_boundary',
        params: {},
        inputs: { in: { nodeId: 'trail_add' } },
      },

      // ── PASS 1 nodes ───────────────────────────────────────────────────────

      {
        id: 'trail_norm', type: 'transform',
        params: { mult: 1.0, add: 0.0 },
        inputs: { scalar: { nodeId: 'trail_buf' } },
      },
      // Electric-blue → white gradient (deep space feel)
      {
        id: 'color', type: 'color_map',
        params: { color1: controls.colors.background, color2: controls.colors.contour_color },
        inputs: { mask: { nodeId: 'trail_norm' } },
      },
      { id: 'out', type: 'output', params: {}, inputs: { color: { nodeId: 'color' } } },
    ],
  };
}

/**
 * Two-pass flow-field graph — LIC-style particle dashes following a Perlin
 * noise vector field.
 *
 * Pass 0 — particle accumulation buffer (ping-pong FBO, passId: 'ff_buf')
 *   flow_field_particle → trail_signal + trail_decay(prev*rate) → pass_boundary
 *
 * Pass 1 — colorise (final)
 *   ff_buf → color_map → output
 *
 * IMPORTANT: pass_boundary node ('ff_buf') MUST appear in nodes[] array before
 * Pass-1 nodes (compiler linear scan, Compiler.ts lines 46–50).
 */
function buildFlowFieldGraph(controls: PresetConfig['controls']): GraphDef {
  return {
    outputNodeId: 'out',
    nodes: [
      // ── PASS 0 nodes ───────────────────────────────────────────────────────

      { id: 'uv',  type: 'uv',   params: {}, inputs: {} },
      { id: 'time', type: 'time', params: { value: 0.0 }, inputs: {} },

      // Flow-field LIC — outputs [0,1] dash brightness per pixel
      // fieldScale/seedScale/stepSize/numSteps pushed each frame via onFrame
      {
        id: 'ff_particles', type: 'flow_field_particle',
        params: {
          fieldScale: 2.5,
          seedScale:  8.0,
          stepSize:   0.006,
          numSteps:   16,
        },
        inputs: { uv: { nodeId: 'uv' }, time: { nodeId: 'time' } },
      },

      // Boost particle signal before accumulating
      {
        id: 'ff_signal', type: 'transform',
        params: { mult: 3.0, add: 0.0 },
        inputs: { scalar: { nodeId: 'ff_particles' } },
      },

      // Temporal decay — read previous frame from ping-pong FBO
      {
        id: 'ff_fb', type: 'feedback',
        params: {},
        inputs: { uv: { nodeId: 'uv' } },
      },
      {
        id: 'ff_decay', type: 'transform',
        params: { mult: 0.88, add: 0.0 },
        inputs: { scalar: { nodeId: 'ff_fb' } },
      },

      // Additive accumulation: prev*decayRate + signal*brightness
      {
        id: 'ff_add', type: 'math_add',
        params: {},
        inputs: { a: { nodeId: 'ff_decay' }, b: { nodeId: 'ff_signal' } },
      },

      // ── pass_boundary MUST be here — before Pass-1 nodes ─────────────────
      {
        id: 'ff_buf', type: 'pass_boundary',
        params: {},
        inputs: { in: { nodeId: 'ff_add' } },
      },

      // ── PASS 1 nodes ───────────────────────────────────────────────────────

      {
        id: 'ff_norm', type: 'transform',
        params: { mult: 1.0, add: 0.0 },
        inputs: { scalar: { nodeId: 'ff_buf' } },
      },
      // Deep-navy background → electric blue → white tips
      {
        id: 'color', type: 'color_map',
        params: { color1: controls.colors.background, color2: controls.colors.contour_color },
        inputs: { mask: { nodeId: 'ff_norm' } },
      },
      { id: 'out', type: 'output', params: {}, inputs: { color: { nodeId: 'color' } } },
    ],
  };
}

// ─── Playground component ────────────────────────────────────────────────────

export default function Playground() {
  const [compiled, setCompiled] = useState<CompiledShader[] | null>(null);
  const [currentGraph, setCurrentGraph] = useState<GraphDef | null>(null);
  const [compileCount, setCompileCount] = useState(0);
  const [shaderError, setShaderError] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState(PRESETS[0].id);
  const [zenMode, setZenMode] = useState(false);
  const [showZenTooltip, setShowZenTooltip] = useState(false);
  const timeRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Smoothed uniform values for temporal interpolation
  const smoothedUniforms = useRef<Record<string, number>>({
    scale: PRESETS[0].controls.noise.scale,
    fbmOctaves: PRESETS[0].controls.noise.fbmOctaves,
    warpIntensity: PRESETS[0].controls.warp.intensity,
    warpScale: PRESETS[0].controls.warp.warpScale,
    contourFrequency: PRESETS[0].controls.contour.frequency,
    contourThickness: PRESETS[0].controls.contour.thickness,
    contourSmoothing: PRESETS[0].controls.contour.smoothing,
  });

  // ─── Zen Mode toggle ────────────────────────────────────────────
  const toggleZen = useCallback(() => {
    setZenMode(prev => !prev);
  }, []);

  // Apply zen mode class to body
  useEffect(() => {
    if (zenMode) {
      document.body.classList.add('zen-mode');
    } else {
      document.body.classList.remove('zen-mode');
    }
    return () => {
      document.body.classList.remove('zen-mode');
    };
  }, [zenMode]);

  // First-visit zen tooltip
  useEffect(() => {
    const seen = localStorage.getItem(ZEN_TOOLTIP_KEY);
    if (!seen) {
      setShowZenTooltip(true);
      const timer = setTimeout(() => {
        setShowZenTooltip(false);
        localStorage.setItem(ZEN_TOOLTIP_KEY, 'true');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Keyboard shortcut: Z key (ignore when in input fields)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'z' || e.key === 'Z') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if ((e.target as HTMLElement).isContentEditable) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        toggleZen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleZen]);

  // ─── Leva Controls ───────────────────────────────────────────────
  const [noiseControls, setNoise] = useControls('Noise', () => ({
    scale: {
      value: PRESETS[0].controls.noise.scale,
      min: 0.5, max: 20.0, step: 0.1,
      hint: 'Zoom level of the noise pattern — lower = zoomed in, higher = zoomed out',
    },
    fbmOctaves: {
      value: PRESETS[0].controls.noise.fbmOctaves,
      min: 1, max: 8, step: 1,
      hint: 'Layers of noise detail stacked at increasing frequencies',
    },
  }));

  const [warpControls, setWarp] = useControls('Domain Warp', () => ({
    intensity: {
      value: PRESETS[0].controls.warp.intensity,
      min: 0.0, max: 2.0, step: 0.01,
      hint: 'How much the noise folds back on itself — creates organic distortion',
    },
    warpScale: {
      value: PRESETS[0].controls.warp.warpScale,
      min: 0.5, max: 10.0, step: 0.5,
      hint: 'Scale of the warping noise layer — separate from main noise',
    },
  }));

  const [contourControls, setContour] = useControls('Contour', () => ({
    frequency: {
      value: PRESETS[0].controls.contour.frequency,
      min: 1.0, max: 40.0, step: 0.5,
      hint: 'Number of contour lines per noise unit — higher = denser lines',
    },
    thickness: {
      value: PRESETS[0].controls.contour.thickness,
      min: 0.01, max: 0.5, step: 0.01,
      hint: 'Width of each contour line — thicker lines fill more space',
    },
    smoothing: {
      value: PRESETS[0].controls.contour.smoothing,
      min: 0.0, max: 0.2, step: 0.005,
      hint: 'Anti-aliasing softness at contour edges — prevents jagged lines',
    },
  }));

  const [colorControls, setColors] = useControls('Colors', () => ({
    background: {
      value: PRESETS[0].controls.colors.background,
      hint: 'Background color behind contour lines',
    },
    contour_color: {
      value: PRESETS[0].controls.colors.contour_color,
      hint: 'Color of the contour lines themselves',
    },
  }));

  const [animControls, setAnim] = useControls('Animation', () => ({
    timeSpeed: {
      value: PRESETS[0].controls.animation.timeSpeed,
      min: 0.001, max: 0.02, step: 0.001,
      hint: 'Lower = slower, more fluid motion',
      label: 'Animation speed',
    },
    noiseTimeScale: {
      value: PRESETS[0].controls.animation.noiseTimeScale,
      min: 0.05, max: 1.0, step: 0.05,
      hint: 'How much time affects noise coordinates — lower = smoother drift',
      label: 'Time influence',
    },
  }));

  // ─── Flow Trails controls (only active for flow-trails preset) ───
  const isFlowTrails = activePresetId === 'flow-trails';

  // setFlow intentionally omitted — keeps user's last value across preset switches.
  const [flowControls] = useControls('Flow Trails', () => ({
    decayRate: {
      value: 0.93,
      min: 0.80, max: 0.99, step: 0.005,
      hint: 'How fast trails fade — lower = shorter, higher = longer persistence',
      label: 'Decay rate',
    },
    trailBrightness: {
      value: 2.0,
      min: 0.5, max: 6.0, step: 0.1,
      hint: 'Multiplier on contour signal before adding to trail buffer',
      label: 'Trail brightness',
    },
  }), { collapsed: !isFlowTrails });

  // ─── Flow Field controls (only active for flow-field preset) ────
  const isFlowField = activePresetId === 'flow-field';

  const [flowFieldControls] = useControls('Flow Field', () => ({
    fieldScale: {
      value: 2.5,
      min: 0.5, max: 8.0, step: 0.1,
      hint: 'Spatial frequency of the angle-noise — higher = tighter swirls',
      label: 'Field scale',
    },
    seedScale: {
      value: 8.0,
      min: 2.0, max: 20.0, step: 0.5,
      hint: 'Spatial frequency of seed-dot noise — higher = finer particle dots',
      label: 'Seed scale',
    },
    stepSize: {
      value: 0.006,
      min: 0.001, max: 0.02, step: 0.001,
      hint: 'UV distance per step along the flow — larger = longer dashes',
      label: 'Step size',
    },
    numSteps: {
      value: 16,
      min: 4, max: 48, step: 2,
      hint: 'Number of steps traced per pixel — more = longer, denser dashes',
      label: 'Dash length',
    },
    decayRate: {
      value: 0.88,
      min: 0.70, max: 0.98, step: 0.005,
      hint: 'How fast particle trails fade — lower = ephemeral dashes, higher = long ghosts',
      label: 'Decay rate',
    },
    signalBrightness: {
      value: 3.0,
      min: 0.5, max: 8.0, step: 0.1,
      hint: 'Brightness boost before accumulating into the trail buffer',
      label: 'Brightness',
    },
  }), { collapsed: !isFlowField });

  // ─── Preset selection ─────────────────────────────────────────
  const handlePresetSelect = useCallback((preset: PresetConfig) => {
    setActivePresetId(preset.id);
    setNoise({ scale: preset.controls.noise.scale, fbmOctaves: preset.controls.noise.fbmOctaves });
    setWarp({ intensity: preset.controls.warp.intensity, warpScale: preset.controls.warp.warpScale });
    setContour({
      frequency: preset.controls.contour.frequency,
      thickness: preset.controls.contour.thickness,
      smoothing: preset.controls.contour.smoothing,
    });
    setColors({
      background: preset.controls.colors.background,
      contour_color: preset.controls.colors.contour_color,
    });
    setAnim({
      timeSpeed: preset.controls.animation.timeSpeed,
      noiseTimeScale: preset.controls.animation.noiseTimeScale,
    });
    // The useEffect below will pick up the changes and recompile
  }, [setNoise, setWarp, setContour, setColors, setAnim]);

  // ─── Build graph & compile ────────────────────────────────────
  const buildAndCompile = useCallback((controls: PresetConfig['controls'], presetId: string) => {
    const graph = presetId === 'flow-trails'
      ? buildFlowTrailsGraph(controls)
      : presetId === 'flow-field'
        ? buildFlowFieldGraph(controls)
        : presetId === 'neon'
          ? buildNeonGraph(controls)
          : presetId === 'inferno'
            ? buildInfernoGraph(controls)
            : presetId === 'glitch'
              ? buildGlitchGraph(controls)
              : buildSinglePassGraph(controls);

    try {
      setCurrentGraph(graph);
      const passes = compileGraph(graph);
      setCompiled(passes);
      setCompileCount(c => c + 1);
      setGraphError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Graph compilation error:', msg);
      setGraphError(msg);
    }
  }, []);

  // Rebuild graph whenever Leva controls change or preset switches
  useEffect(() => {
    buildAndCompile({
      noise: { scale: noiseControls.scale, fbmOctaves: noiseControls.fbmOctaves },
      warp: { intensity: warpControls.intensity, warpScale: warpControls.warpScale },
      contour: {
        frequency: contourControls.frequency,
        thickness: contourControls.thickness,
        smoothing: contourControls.smoothing,
      },
      colors: { background: colorControls.background, contour_color: colorControls.contour_color },
      animation: { timeSpeed: animControls.timeSpeed, noiseTimeScale: animControls.noiseTimeScale },
    }, activePresetId);
  }, [
    noiseControls.scale, noiseControls.fbmOctaves,
    warpControls.intensity, warpControls.warpScale,
    contourControls.frequency, contourControls.thickness, contourControls.smoothing,
    colorControls.background, colorControls.contour_color,
    animControls.timeSpeed, animControls.noiseTimeScale,
    activePresetId,
    buildAndCompile,
  ]);

  // ─── Temporal smoothing + frame callback ────────────────────
  const animControlsRef = useRef(animControls);
  useEffect(() => { animControlsRef.current = animControls; }, [animControls]);

  const noiseControlsRef = useRef(noiseControls);
  useEffect(() => { noiseControlsRef.current = noiseControls; }, [noiseControls]);

  const warpControlsRef = useRef(warpControls);
  useEffect(() => { warpControlsRef.current = warpControls; }, [warpControls]);

  const contourControlsRef = useRef(contourControls);
  useEffect(() => { contourControlsRef.current = contourControls; }, [contourControls]);

  const flowControlsRef = useRef(flowControls);
  useEffect(() => { flowControlsRef.current = flowControls; }, [flowControls]);

  const flowFieldControlsRef = useRef(flowFieldControls);
  useEffect(() => { flowFieldControlsRef.current = flowFieldControls; }, [flowFieldControls]);

  const activePresetIdRef = useRef(activePresetId);
  useEffect(() => { activePresetIdRef.current = activePresetId; }, [activePresetId]);

  const onFrame = useCallback((renderer: any) => {
    const speed = animControlsRef.current.timeSpeed;
    timeRef.current += speed;

    // Exponential lerp toward target values for all animated uniforms
    const s = smoothedUniforms.current;
    const f = UNIFORM_SMOOTH_FACTOR;
    s.scale += (noiseControlsRef.current.scale - s.scale) * f;
    s.warpIntensity += (warpControlsRef.current.intensity - s.warpIntensity) * f;
    s.warpScale += (warpControlsRef.current.warpScale - s.warpScale) * f;
    s.contourFrequency += (contourControlsRef.current.frequency - s.contourFrequency) * f;
    s.contourThickness += (contourControlsRef.current.thickness - s.contourThickness) * f;
    s.contourSmoothing += (contourControlsRef.current.smoothing - s.contourSmoothing) * f;

    if (activePresetIdRef.current === 'flow-trails') {
      // Flow Trails two-pass — dual warp, electric palette
      const fc = flowControlsRef.current;
      renderer.updateUniforms({
        'u_time_value':              timeRef.current,
        'u_main_noise_scale':        s.scale,
        'u_warp_large_intensity':    s.warpIntensity * 0.5,
        'u_warp_fine_intensity':     s.warpIntensity * 0.3,
        'u_warp_large_fbm_scale':    s.warpScale * 0.55,
        'u_warp_fine_fbm_scale':     s.warpScale,
        'u_contour_frequency':       s.contourFrequency,
        'u_contour_thickness':       s.contourThickness,
        'u_contour_smoothing':       s.contourSmoothing,
        'u_trail_signal_mult':       fc.trailBrightness,
        'u_trail_decay_mult':        fc.decayRate,
      });
    } else if (activePresetIdRef.current === 'flow-field') {
      // Flow Field two-pass — LIC particle dashes
      const ffc = flowFieldControlsRef.current;
      renderer.updateUniforms({
        'u_time_value':              timeRef.current,
        'u_ff_particles_fieldScale': ffc.fieldScale,
        'u_ff_particles_seedScale':  ffc.seedScale,
        'u_ff_particles_stepSize':   ffc.stepSize,
        'u_ff_particles_numSteps':   ffc.numSteps,
        'u_ff_signal_mult':          ffc.signalBrightness,
        'u_ff_decay_mult':           ffc.decayRate,
      });
    } else if (activePresetIdRef.current === 'neon') {
      // Neon: drive hueShift with time for continuously cycling colours
      renderer.updateUniforms({
        'u_time_value':          timeRef.current,
        'u_main_noise_scale':    s.scale,
        'u_warp_intensity':      s.warpIntensity,
        'u_warp_fbm_scale':      s.warpScale,
        'u_contour_frequency':   s.contourFrequency,
        'u_contour_thickness':   s.contourThickness,
        'u_contour_smoothing':   s.contourSmoothing,
        'u_rainbow_hueShift':    (timeRef.current * 0.05) % 1.0,
      });
    } else if (activePresetIdRef.current === 'inferno' || activePresetIdRef.current === 'glitch') {
      // Inferno + Glitch have custom graph builders but share the same uniform names
      renderer.updateUniforms({
        'u_time_value':            timeRef.current,
        'u_terrain_scale':         s.scale,       // inferno: terrain fbm scale
        'u_noise_a_scale':         s.scale,       // glitch: field A scale
        'u_warp_large_intensity':  s.warpIntensity * 0.7,
        'u_warp_fine_intensity':   s.warpIntensity * 0.4,
        'u_warp_intensity':        s.warpIntensity,
        'u_warp_fbm_large_scale':  1.4,
        'u_warp_fbm_fine_scale':   s.warpScale,
        'u_warp_src_scale':        s.warpScale,
        'u_contour_frequency':     s.contourFrequency,
        'u_contour_thickness':     s.contourThickness,
        'u_contour_smoothing':     s.contourSmoothing,
      });
    } else {
      // Standard single-pass uniforms
      renderer.updateUniforms({
        'u_time_value':        timeRef.current,
        'u_main_noise_scale':  s.scale,
        'u_warp_intensity':    s.warpIntensity,
        'u_warp_fbm_scale':    s.warpScale,
        'u_contour_frequency': s.contourFrequency,
        'u_contour_thickness': s.contourThickness,
        'u_contour_smoothing': s.contourSmoothing,
      });
    }
  }, []);

  const handleShaderError = useCallback((error: string) => {
    setShaderError(error || null);
  }, []);

  const uniforms = useMemo(() => ({}), []);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {/* Full-screen canvas layer — NEVER hidden */}
      <div className="canvas-layer">
        <EngineCanvas
          compiledShader={compiled}
          uniforms={uniforms}
          onFrame={onFrame}
          onShaderError={handleShaderError}
          canvasRef={canvasRef}
        />
      </div>

      {/* HUD overlay — top left */}
      <HUD />

      {/* Unified right sidebar — DAG + Leva */}
      <RightSidebar>
        {/* Section: LIVE DAG */}
        <NodeGraphPanel graph={currentGraph} />

        {/* Divider */}
        <div className="sidebar-divider" />

        {/* Section: Leva controls */}
        <div className="sidebar-leva-section" id="leva-wrapper">
          <Leva
            collapsed={false}
            fill
            flat
            theme={{
              colors: {
                elevation1: 'rgba(5, 5, 16, 0.85)',
                elevation2: 'rgba(5, 5, 16, 0.92)',
              },
            }}
          />
        </div>
      </RightSidebar>

      {/* Compile feedback badge */}
      <div data-overlay>
        <CompileBadge compileCount={compileCount} />
      </div>

      {/* Error panels */}
      <div data-overlay>
        <ErrorPanel error={graphError || shaderError} />
      </div>

      {/* Preset switcher — bottom center */}
      <PresetSwitcher activePresetId={activePresetId} onSelect={handlePresetSelect} />

      {/* Export buttons — bottom right */}
      <div data-overlay id="export-wrapper">
        <ExportButtons canvasRef={canvasRef} compiledShader={compiled} />
      </div>

      {/* Zen mode toggle button — always visible, never hidden by zen mode */}
      <button
        className={`zen-toggle ${zenMode ? 'active' : ''}`}
        onClick={toggleZen}
        title={zenMode ? 'Exit zen mode (Z)' : 'Enter zen mode (Z)'}
        id="zen-toggle-btn"
        aria-label={zenMode ? 'Exit zen mode' : 'Enter zen mode'}
      >
        {zenMode ? '⤡' : '⤢'}
      </button>

      {/* First-visit zen tooltip */}
      {showZenTooltip && (
        <div className="zen-tooltip" id="zen-tooltip">
          Press <kbd>Z</kbd> to focus
        </div>
      )}
    </div>
  );
}
