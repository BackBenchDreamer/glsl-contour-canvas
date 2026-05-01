"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Leva, useControls } from 'leva';
import { EngineCanvas } from '../renderer/EngineCanvas';
import { GraphDef } from '../engine/Graph';
import { compileGraph, CompiledShader } from '../engine/Compiler';
import '../nodes';

export default function Playground() {
  const [compiled, setCompiled] = useState<CompiledShader[] | null>(null);
  const timeRef = useRef(0);

  const noiseControls = useControls('Noise', {
    scale: { value: 4.0, min: 0.5, max: 20.0, step: 0.5 },
    fbmOctaves: { value: 4, min: 1, max: 8, step: 1 },
  });

  const warpControls = useControls('Domain Warp', {
    intensity: { value: 0.4, min: 0.0, max: 2.0, step: 0.01 },
    warpScale: { value: 2.0, min: 0.5, max: 10.0, step: 0.5 },
  });

  const contourControls = useControls('Contour', {
    frequency: { value: 8.0, min: 1.0, max: 40.0, step: 0.5 },
    thickness: { value: 0.08, min: 0.01, max: 0.5, step: 0.01 },
    smoothing: { value: 0.04, min: 0.0, max: 0.2, step: 0.005 },
  });

  const colorControls = useControls('Colors', {
    background: '#050510',
    contour_color: '#00ffcc',
  });

  // Rebuild graph whenever controls change — this re-compiles the shader
  useEffect(() => {
    const graph: GraphDef = {
      outputNodeId: 'out',
      nodes: [
        { id: 'uv', type: 'uv', params: {}, inputs: {} },
        { id: 'time', type: 'time', params: { value: 0.0 }, inputs: {} },

        // FBM noise for warping
        { id: 'warp_fbm', type: 'noise_fbm', params: { octaves: noiseControls.fbmOctaves, scale: warpControls.warpScale, offset: [0, 0] }, inputs: { uv: { nodeId: 'uv' } } },

        // Domain warp
        { id: 'warp', type: 'warp', params: { intensity: warpControls.intensity }, inputs: { uv: { nodeId: 'uv' }, warpField: { nodeId: 'warp_fbm' } } },

        // Main noise through warped UV
        { id: 'main_noise', type: 'noise_simplex', params: { scale: noiseControls.scale, offset: [0, 0] }, inputs: { uv: { nodeId: 'warp' } } },

        // Animate by adding time
        { id: 'animated', type: 'math_add', params: {}, inputs: { a: { nodeId: 'main_noise' }, b: { nodeId: 'time' } } },

        // Contour
        { id: 'contour', type: 'contour', params: { frequency: contourControls.frequency, thickness: contourControls.thickness, smoothing: contourControls.smoothing }, inputs: { scalar: { nodeId: 'animated' } } },

        // Color
        { id: 'color', type: 'color_map', params: { color1: colorControls.background, color2: colorControls.contour_color }, inputs: { mask: { nodeId: 'contour' } } },

        { id: 'out', type: 'output', params: {}, inputs: { color: { nodeId: 'color' } } },
      ],
    };

    try {
      const passes = compileGraph(graph);
      setCompiled(passes);
    } catch (e) {
      console.error('Graph compilation error:', e);
    }
  }, [
    noiseControls.scale, noiseControls.fbmOctaves,
    warpControls.intensity, warpControls.warpScale,
    contourControls.frequency, contourControls.thickness, contourControls.smoothing,
    colorControls.background, colorControls.contour_color,
  ]);

  const onFrame = (renderer: any) => {
    timeRef.current += 0.004;
    renderer.updateUniforms({ 'u_time_value': timeRef.current });
  };

  const uniforms = useMemo(() => ({}), []);

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative font-sans text-white">
      <div className="absolute inset-0">
        <EngineCanvas compiledShader={compiled} uniforms={uniforms} onFrame={onFrame} />
      </div>
      <div className="absolute top-6 left-6 z-10 pointer-events-none">
        <h1 className="text-4xl font-bold tracking-tight text-white/90 drop-shadow-lg">
          Node Contour Engine
        </h1>
        <p className="text-white/60 mt-2 font-medium">
          Procedural GLSL Graph Compiler
        </p>
      </div>
      <Leva
        collapsed={false}
        theme={{
          colors: { elevation1: 'rgba(0,0,0,0.85)', elevation2: 'rgba(0,0,0,0.92)' },
        }}
      />
    </div>
  );
}
