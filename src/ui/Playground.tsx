"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Leva, useControls } from 'leva';
import { EngineCanvas } from '../renderer/EngineCanvas';
import { GraphDef } from '../engine/Graph';
import { compileGraph, CompiledShader } from '../engine/Compiler';
import { HUD } from '../components/HUD';
import { PresetSwitcher } from '../components/PresetSwitcher';
import { NodeGraphPanel } from '../components/NodeGraphPanel';
import { CompileBadge } from '../components/CompileBadge';
import { ErrorPanel } from '../components/ErrorPanel';
import { ExportButtons } from '../components/ExportButtons';
import { PRESETS, PresetConfig } from '../data/presets';
import '../nodes';

export default function Playground() {
  const [compiled, setCompiled] = useState<CompiledShader[] | null>(null);
  const [currentGraph, setCurrentGraph] = useState<GraphDef | null>(null);
  const [compileCount, setCompileCount] = useState(0);
  const [shaderError, setShaderError] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState(PRESETS[0].id);
  const timeRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ─── Leva Controls with hints ─────────────────────────────────
  // useControls returns [values, set] when called with a function returning schema
  const [noiseControls, setNoise] = useControls('Noise', () => ({
    scale: {
      value: PRESETS[0].controls.noise.scale,
      min: 0.5, max: 20.0, step: 0.5,
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

  // ─── Preset selection ─────────────────────────────────────────
  const handlePresetSelect = useCallback((preset: PresetConfig) => {
    setActivePresetId(preset.id);
    // Programmatically update all Leva controls to match the preset
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
    // The useEffect below will pick up the changes and recompile
  }, [setNoise, setWarp, setContour, setColors]);

  // ─── Build graph & compile ────────────────────────────────────
  const buildAndCompile = useCallback((controls: PresetConfig['controls']) => {
    const graph: GraphDef = {
      outputNodeId: 'out',
      nodes: [
        { id: 'uv', type: 'uv', params: {}, inputs: {} },
        { id: 'time', type: 'time', params: { value: 0.0 }, inputs: {} },

        // FBM noise for warping
        {
          id: 'warp_fbm', type: 'noise_fbm',
          params: { octaves: controls.noise.fbmOctaves, scale: controls.warp.warpScale, offset: [0, 0] },
          inputs: { uv: { nodeId: 'uv' } },
        },

        // Domain warp
        {
          id: 'warp', type: 'warp',
          params: { intensity: controls.warp.intensity },
          inputs: { uv: { nodeId: 'uv' }, warpField: { nodeId: 'warp_fbm' } },
        },

        // Main noise through warped UV
        {
          id: 'main_noise', type: 'noise_simplex',
          params: { scale: controls.noise.scale, offset: [0, 0] },
          inputs: { uv: { nodeId: 'warp' } },
        },

        // Animate by adding time
        {
          id: 'animated', type: 'math_add',
          params: {},
          inputs: { a: { nodeId: 'main_noise' }, b: { nodeId: 'time' } },
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

  // Rebuild graph whenever Leva controls change
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
    });
  }, [
    noiseControls.scale, noiseControls.fbmOctaves,
    warpControls.intensity, warpControls.warpScale,
    contourControls.frequency, contourControls.thickness, contourControls.smoothing,
    colorControls.background, colorControls.contour_color,
    buildAndCompile,
  ]);

  const onFrame = (renderer: any) => {
    timeRef.current += 0.004;
    renderer.updateUniforms({ 'u_time_value': timeRef.current });
  };

  const handleShaderError = useCallback((error: string) => {
    setShaderError(error || null);
  }, []);

  const uniforms = useMemo(() => ({}), []);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {/* Full-screen canvas layer */}
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

      {/* Leva controls — top right */}
      <Leva
        collapsed={false}
        theme={{
          colors: {
            elevation1: 'rgba(5, 5, 16, 0.85)',
            elevation2: 'rgba(5, 5, 16, 0.92)',
          },
        }}
      />

      {/* Node graph panel — right side */}
      <NodeGraphPanel graph={currentGraph} />

      {/* Compile feedback badge */}
      <CompileBadge compileCount={compileCount} />

      {/* Error panels */}
      <ErrorPanel error={graphError || shaderError} />

      {/* Preset switcher — bottom center */}
      <PresetSwitcher activePresetId={activePresetId} onSelect={handlePresetSelect} />

      {/* Export buttons — bottom right */}
      <ExportButtons canvasRef={canvasRef} compiledShader={compiled} />
    </div>
  );
}
