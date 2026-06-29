import { GraphDef } from '../engine/Graph';

export interface PresetConfig {
  id: string;
  name: string;
  description: string;
  /** CSS gradient for the thumbnail */
  thumbGradient: string;
  /** Leva control overrides */
  controls: {
    noise: { scale: number; fbmOctaves: number };
    warp: { intensity: number; warpScale: number };
    contour: { frequency: number; thickness: number; smoothing: number };
    colors: { background: string; contour_color: string };
    animation: { timeSpeed: number; noiseTimeScale: number };
  };
}

export const PRESETS: PresetConfig[] = [
  {
    id: 'topographic',
    name: 'Topographic',
    description: 'Classic topo map with FBM layered contours',
    thumbGradient: 'linear-gradient(135deg, #1a4a3a, #2d7a5f, #8fbfa3, #eee8d5)',
    controls: {
      noise: { scale: 1.2, fbmOctaves: 4 },
      warp: { intensity: 0.3, warpScale: 2.5 },
      contour: { frequency: 8.0, thickness: 0.16, smoothing: 0.03 },
      colors: { background: '#0a1f1a', contour_color: '#4fd1a5' },
      animation: { timeSpeed: 0.003, noiseTimeScale: 0.2 },
    },
  },
  {
    id: 'domain-warp',
    name: 'Domain Warp',
    description: 'Heavy warp intensity with warm palette',
    thumbGradient: 'linear-gradient(135deg, #1a0a2e, #6b2fa0, #e05050, #ff9f43)',
    controls: {
      noise: { scale: 0.9, fbmOctaves: 4 },
      warp: { intensity: 1.2, warpScale: 3.0 },
      contour: { frequency: 6.0, thickness: 0.14, smoothing: 0.04 },
      colors: { background: '#0f0520', contour_color: '#ff6b6b' },
      animation: { timeSpeed: 0.003, noiseTimeScale: 0.2 },
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean single-layer simplex noise',
    thumbGradient: 'linear-gradient(135deg, #0a0a0a, #1a1a2e, #333, #0a0a0a)',
    controls: {
      noise: { scale: 1.0, fbmOctaves: 4 },
      warp: { intensity: 0.0, warpScale: 1.0 },
      contour: { frequency: 7.0, thickness: 0.18, smoothing: 0.02 },
      colors: { background: '#060608', contour_color: '#ffffff' },
      animation: { timeSpeed: 0.003, noiseTimeScale: 0.2 },
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Shifting rainbow hue cycle — each elevation band a different colour',
    thumbGradient: 'linear-gradient(135deg, #0a0015, #ff00ff, #00ffff, #ffff00, #ff0080)',
    controls: {
      noise: { scale: 1.1, fbmOctaves: 4 },
      warp: { intensity: 0.5, warpScale: 2.0 },
      contour: { frequency: 9.0, thickness: 0.10, smoothing: 0.022 },
      // background/contour_color unused by neon's rainbow graph — kept for type compat
      colors: { background: '#050010', contour_color: '#00ffff' },
      animation: { timeSpeed: 0.003, noiseTimeScale: 0.18 },
    },
  },
  {
    id: 'inferno',
    name: 'Inferno',
    description: 'Dual-warp heat ramp — lava terrain with glowing fissure lines',
    thumbGradient: 'linear-gradient(135deg, #04010a, #3a0800, #b83000, #ff6a00, #ffe060)',
    controls: {
      // 6 octaves = dense geological terrain
      noise: { scale: 0.9, fbmOctaves: 6 },
      // intensity feeds two warp layers at ×0.7 and ×0.4 — see buildInfernoGraph
      warp: { intensity: 0.9, warpScale: 3.5 },
      // dense lines, thin, heavy smoothing = incandescent glow halos
      contour: { frequency: 20.0, thickness: 0.04, smoothing: 0.14 },
      // colors unused by heat_map — kept for type compat
      colors: { background: '#04010a', contour_color: '#ff6a00' },
      animation: { timeSpeed: 0.0015, noiseTimeScale: 0.08 },
    },
  },
  {
    id: 'glitch',
    name: 'Glitch',
    description: 'Dual-field interference grid torn apart by extreme warp',
    thumbGradient: 'linear-gradient(135deg, #030008, #00ff88, #ff0055, #030008)',
    controls: {
      // scale applied to field A; field B uses ×0.45 — see buildGlitchGraph
      noise: { scale: 3.5, fbmOctaves: 2 },
      // large warp scale (0.8) = sweeping broad tears, not fine jitter
      warp: { intensity: 2.8, warpScale: 0.8 },
      // high frequency over interference signal = dense bright grid lines
      contour: { frequency: 22.0, thickness: 0.09, smoothing: 0.006 },
      colors: { background: '#030008', contour_color: '#00ff88' },
      animation: { timeSpeed: 0.011, noiseTimeScale: 0.6 },
    },
  },
  {
    id: 'flow-trails',
    name: 'Flow Trails',
    description: 'Electric ghost-trails — dual-warp lightning veins with additive temporal decay',
    thumbGradient: 'linear-gradient(135deg, #000005, #001028, #003060, #00c8ff22)',
    controls: {
      // dual warp: large (×0.5 intensity) + fine (×0.3) — see buildFlowTrailsGraph
      noise: { scale: 1.6, fbmOctaves: 4 },
      warp: { intensity: 0.9, warpScale: 2.8 },
      // tight lines — glow dominates over fill
      contour: { frequency: 14.0, thickness: 0.06, smoothing: 0.025 },
      colors: { background: '#000005', contour_color: '#40e0ff' },
      animation: { timeSpeed: 0.0022, noiseTimeScale: 0.18 },
    },
  },
  {
    id: 'flow-field',
    name: 'Flow Field',
    description: 'Perlin-noise vector field — short particle dashes trace invisible wind currents',
    thumbGradient: 'linear-gradient(135deg, #000208, #001020, #004488, #0088ff18)',
    controls: {
      // noise controls used for the decay pass timing only
      noise: { scale: 1.0, fbmOctaves: 3 },
      warp: { intensity: 0.0, warpScale: 1.0 },
      contour: { frequency: 1.0, thickness: 0.1, smoothing: 0.02 },
      colors: { background: '#000208', contour_color: '#55aaff' },
      animation: { timeSpeed: 0.003, noiseTimeScale: 0.2 },
    },
  },
];

export function getPresetById(id: string): PresetConfig | undefined {
  return PRESETS.find(p => p.id === id);
}
