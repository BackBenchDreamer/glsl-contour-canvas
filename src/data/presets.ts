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
  };
}

export const PRESETS: PresetConfig[] = [
  {
    id: 'topographic',
    name: 'Topographic',
    description: 'Classic topo map with FBM layered contours',
    thumbGradient: 'linear-gradient(135deg, #1a4a3a, #2d7a5f, #8fbfa3, #eee8d5)',
    controls: {
      noise: { scale: 4.0, fbmOctaves: 5 },
      warp: { intensity: 0.3, warpScale: 2.5 },
      contour: { frequency: 10.0, thickness: 0.06, smoothing: 0.03 },
      colors: { background: '#0a1f1a', contour_color: '#4fd1a5' },
    },
  },
  {
    id: 'domain-warp',
    name: 'Domain Warp',
    description: 'Heavy warp intensity with warm palette',
    thumbGradient: 'linear-gradient(135deg, #1a0a2e, #6b2fa0, #e05050, #ff9f43)',
    controls: {
      noise: { scale: 3.0, fbmOctaves: 4 },
      warp: { intensity: 1.2, warpScale: 3.0 },
      contour: { frequency: 8.0, thickness: 0.08, smoothing: 0.04 },
      colors: { background: '#0f0520', contour_color: '#ff6b6b' },
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean single-layer simplex noise',
    thumbGradient: 'linear-gradient(135deg, #0a0a0a, #1a1a2e, #333, #0a0a0a)',
    controls: {
      noise: { scale: 6.0, fbmOctaves: 1 },
      warp: { intensity: 0.0, warpScale: 1.0 },
      contour: { frequency: 12.0, thickness: 0.04, smoothing: 0.02 },
      colors: { background: '#060608', contour_color: '#ffffff' },
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Vivid cyan-magenta on dark background',
    thumbGradient: 'linear-gradient(135deg, #0a0015, #0ff, #f0f, #0a0015)',
    controls: {
      noise: { scale: 3.5, fbmOctaves: 6 },
      warp: { intensity: 0.5, warpScale: 2.0 },
      contour: { frequency: 15.0, thickness: 0.05, smoothing: 0.025 },
      colors: { background: '#050010', contour_color: '#00ffff' },
    },
  },
  {
    id: 'inferno',
    name: 'Inferno',
    description: 'Hot palette inspired by matplotlib inferno',
    thumbGradient: 'linear-gradient(135deg, #000004, #420a68, #b73779, #ed7953, #fcffa4)',
    controls: {
      noise: { scale: 5.0, fbmOctaves: 5 },
      warp: { intensity: 0.6, warpScale: 2.5 },
      contour: { frequency: 6.0, thickness: 0.1, smoothing: 0.05 },
      colors: { background: '#000004', contour_color: '#ed7953' },
    },
  },
  {
    id: 'glitch',
    name: 'Glitch',
    description: 'High-frequency saturated interference patterns',
    thumbGradient: 'linear-gradient(135deg, #0a0020, #00ff88, #ff0055, #0044ff, #0a0020)',
    controls: {
      noise: { scale: 12.0, fbmOctaves: 3 },
      warp: { intensity: 1.8, warpScale: 8.0 },
      contour: { frequency: 30.0, thickness: 0.03, smoothing: 0.015 },
      colors: { background: '#020010', contour_color: '#00ff88' },
    },
  },
];

export function getPresetById(id: string): PresetConfig | undefined {
  return PRESETS.find(p => p.id === id);
}
