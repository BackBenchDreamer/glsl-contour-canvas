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
      if (
        e.key === 'z' || e.key === 'Z'
      ) {
        // Ignore if typing in an input field
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if ((e.target as HTMLElement).isContentEditable) return;
        // Ignore if modifier keys are held
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        toggleZen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleZen]);

  // ─── Leva Controls with hints ─────────────────────────────────
  // useControls returns [values, set] when called with a function returning schema
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
    setAnim({
      timeSpeed: preset.controls.animation.timeSpeed,
      noiseTimeScale: preset.controls.animation.noiseTimeScale,
    });
    // The useEffect below will pick up the changes and recompile
  }, [setNoise, setWarp, setContour, setColors, setAnim]);

  // ─── Build graph & compile ────────────────────────────────────
  const buildAndCompile = useCallback((controls: PresetConfig['controls']) => {
    const graph: GraphDef = {
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

        // Animate by adding scaled time (not raw time)
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
      animation: { timeSpeed: animControls.timeSpeed, noiseTimeScale: animControls.noiseTimeScale },
    });
  }, [
    noiseControls.scale, noiseControls.fbmOctaves,
    warpControls.intensity, warpControls.warpScale,
    contourControls.frequency, contourControls.thickness, contourControls.smoothing,
    colorControls.background, colorControls.contour_color,
    animControls.timeSpeed, animControls.noiseTimeScale,
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

    renderer.updateUniforms({
      'u_time_value': timeRef.current,
      'u_main_noise_scale': s.scale,
      'u_warp_intensity': s.warpIntensity,
      'u_warp_fbm_scale': s.warpScale,
      'u_contour_frequency': s.contourFrequency,
      'u_contour_thickness': s.contourThickness,
      'u_contour_smoothing': s.contourSmoothing,
    });
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
