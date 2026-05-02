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
    description: 'Vivid cyan-magenta on dark background',
    thumbGradient: 'linear-gradient(135deg, #0a0015, #0ff, #f0f, #0a0015)',
    controls: {
      noise: { scale: 1.1, fbmOctaves: 4 },
      warp: { intensity: 0.5, warpScale: 2.0 },
      contour: { frequency: 7.5, thickness: 0.12, smoothing: 0.025 },
      colors: { background: '#050010', contour_color: '#00ffff' },
      animation: { timeSpeed: 0.003, noiseTimeScale: 0.2 },
    },
  },
  {
    id: 'inferno',
    name: 'Inferno',
    description: 'Hot palette inspired by matplotlib inferno',
    thumbGradient: 'linear-gradient(135deg, #000004, #420a68, #b73779, #ed7953, #fcffa4)',
    controls: {
      noise: { scale: 1.0, fbmOctaves: 4 },
      warp: { intensity: 0.6, warpScale: 2.5 },
      contour: { frequency: 8.0, thickness: 0.15, smoothing: 0.05 },
      colors: { background: '#000004', contour_color: '#ed7953' },
      animation: { timeSpeed: 0.003, noiseTimeScale: 0.2 },
    },
  },
  {
    id: 'glitch',
    name: 'Glitch',
    description: 'High-frequency saturated interference patterns',
    thumbGradient: 'linear-gradient(135deg, #0a0020, #00ff88, #ff0055, #0044ff, #0a0020)',
    controls: {
      noise: { scale: 1.3, fbmOctaves: 4 },
      warp: { intensity: 1.8, warpScale: 8.0 },
      contour: { frequency: 9.0, thickness: 0.10, smoothing: 0.015 },
      colors: { background: '#020010', contour_color: '#00ff88' },
      animation: { timeSpeed: 0.004, noiseTimeScale: 0.25 },
    },
  },
];

export function getPresetById(id: string): PresetConfig | undefined {
  return PRESETS.find(p => p.id === id);
}
