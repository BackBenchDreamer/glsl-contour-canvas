"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Leva, useControls, button } from 'leva';
import { EngineCanvas } from '../renderer/EngineCanvas';
import { GraphDef } from '../engine/Graph';
import { compileGraph, CompiledShader } from '../engine/Compiler';
import '../nodes';

export default function Playground() {
  const [graph, setGraph] = useState<GraphDef | null>(null);
  const [compiled, setCompiled] = useState<CompiledShader[] | null>(null);
  const timeRef = useRef(0);

  useEffect(() => {
    const initialGraph: GraphDef = {
      outputNodeId: 'out',
      nodes: [
        { id: 'uv', type: 'uv', params: {}, inputs: {} },
        { id: 'time', type: 'time', params: { value: 0.0 }, inputs: {} },
        
        // Pass 1: Reaction-Diffusion Field
        { id: 'noise', type: 'noise_simplex', params: { scale: 10.0, offset: [0,0] }, inputs: { uv: { nodeId: 'uv' } } },
        { id: 'anim_noise', type: 'math_add', params: {}, inputs: { a: { nodeId: 'noise' }, b: { nodeId: 'time' } } },
        // A little trick to make noise appear only occasionally or sparsely
        { id: 'sparse_noise', type: 'blend', params: { op: 'max' }, inputs: { a: { nodeId: 'anim_noise' }, b: { value: '-0.8' } } },
        
        // Diffuse the previous frame
        { id: 'diffuse', type: 'diffusion', params: { rate: 1.0 }, inputs: { uv: { nodeId: 'uv' } } },
        
        // Accumulate and Decay
        { id: 'add_new', type: 'math_add', params: {}, inputs: { a: { nodeId: 'diffuse' }, b: { nodeId: 'sparse_noise' } } },
        { id: 'decay_field', type: 'decay', params: { rate: 0.98 }, inputs: { uv: { nodeId: 'uv' }, current: { nodeId: 'add_new' } } },
        
        // Output of Pass 1 (Written to FBO)
        { id: 'pass1_out', type: 'pass_boundary', params: {}, inputs: { in: { nodeId: 'decay_field' } } },

        // Pass 2: Contour & Color
        { id: 'contour', type: 'contour', params: { frequency: 5.0, thickness: 0.05, smoothing: 0.02 }, inputs: { scalar: { nodeId: 'pass1_out' } } },
        { id: 'color', type: 'color_map', params: { color1: '#000000', color2: '#ff0055' }, inputs: { mask: { nodeId: 'contour' } } },
        { id: 'out', type: 'output', params: {}, inputs: { color: { nodeId: 'color' } } }
      ]
    };
    setGraph(initialGraph);
  }, []);

  useEffect(() => {
    if (graph) {
      setCompiled(compileGraph(graph));
    }
  }, [graph]);

  const warpControls = useControls('Warp Node', {
    intensity: { value: 0.5, min: 0.0, max: 2.0, step: 0.01 },
    noiseScale: { value: 2.0, min: 0.1, max: 10.0, step: 0.1 }
  });

  const noiseControls = useControls('Main Noise Node', {
    scale: { value: 3.0, min: 0.1, max: 20.0, step: 0.1 }
  });

  const contourControls = useControls('Contour Node', {
    frequency: { value: 10.0, min: 1.0, max: 50.0, step: 0.1 },
    thickness: { value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
    smoothing: { value: 0.05, min: 0.0, max: 0.5, step: 0.01 }
  });

  const colorControls = useControls('Color Map', {
    bg_color: '#0a0a0a',
    line_color: '#00ffcc'
  });

  const uniforms = useMemo(() => {
    return {
      'u_warp_intensity': warpControls.intensity,
      'u_warp_noise_scale': warpControls.noiseScale,
      'u_main_noise_scale': noiseControls.scale,
      'u_contour_frequency': contourControls.frequency,
      'u_contour_thickness': contourControls.thickness,
      'u_contour_smoothing': contourControls.smoothing,
      'u_color_color1': colorControls.bg_color,
      'u_color_color2': colorControls.line_color
    };
  }, [warpControls, noiseControls, contourControls, colorControls]);

  const onFrame = (renderer: any) => {
    timeRef.current += 0.005;
    renderer.updateUniforms({
      'u_time_value': timeRef.current
    });
  };

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
      <Leva theme={{ colors: { elevation1: 'rgba(0,0,0,0.8)', elevation2: 'rgba(0,0,0,0.9)' } }} />
    </div>
  );
}
