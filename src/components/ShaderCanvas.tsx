"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useControls, Leva } from 'leva';

const vertexShaderSource = `#version 300 es
precision highp float;
in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export default function ShaderCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Leva UI controls
  const controls = useControls({
    palette: {
      options: { Warm: 0, Ice: 1, Mono: 2, Neon: 3 },
      value: 0,
      label: 'Palette'
    },
    seed: { value: 42, step: 1, label: 'Seed' },
    speed: { value: 0.1, min: 0, max: 1, step: 0.01, label: 'Speed' },
    contourRes: { value: 60, min: 10, max: 200, step: 1, label: 'Contour Res' },
    linesOnly: { value: true, label: 'Lines Only' },
    vignetteGrain: { value: true, label: 'Vignette/Grain' }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      console.error('WebGL2 not supported');
      return;
    }

    // Fetch fragment shader source
    let fragmentShaderSource = '';
    
    // Create shader program
    let program: WebGLProgram | null = null;
    let animationFrameId: number;
    let startTime = Date.now();

    const initShader = async () => {
      try {
        const response = await fetch('/shaders/fragment.glsl');
        fragmentShaderSource = await response.text();
        
        const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        if (!vertexShader || !fragmentShader) return;
        
        program = gl.createProgram();
        if (!program) return;
        
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          console.error(gl.getProgramInfoLog(program));
          gl.deleteProgram(program);
          return;
        }
        
        // Setup geometry (fullscreen quad)
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -1, -1,
           1, -1,
          -1,  1,
          -1,  1,
           1, -1,
           1,  1,
        ]), gl.STATIC_DRAW);
        
        const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(positionAttributeLocation);
        gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
        
        render();
      } catch (err) {
        console.error('Failed to init shader', err);
      }
    };

    const compileShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const resize = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth * dpr;
      const height = window.innerHeight * dpr;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      }
    };

    const render = () => {
      if (!program || !gl) return;
      
      resize();
      
      gl.useProgram(program);
      
      const time = (Date.now() - startTime) / 1000;
      
      // Set uniforms
      gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas.width, canvas.height);
      gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time);
      gl.uniform1ui(gl.getUniformLocation(program, 'u_seed'), controls.seed);
      gl.uniform1f(gl.getUniformLocation(program, 'u_speed'), controls.speed);
      gl.uniform1i(gl.getUniformLocation(program, 'u_palette'), controls.palette);
      gl.uniform1f(gl.getUniformLocation(program, 'u_contourResolution'), controls.contourRes);
      gl.uniform1i(gl.getUniformLocation(program, 'u_linesOnly'), controls.linesOnly ? 1 : 0);
      gl.uniform1i(gl.getUniformLocation(program, 'u_vignetteGrain'), controls.vignetteGrain ? 1 : 0);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      
      animationFrameId = requestAnimationFrame(render);
    };

    initShader();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [controls]);

  return (
    <>
      <div className="leva-container">
        <Leva titleBar={{ title: 'Controls' }} theme={{ colors: { accent1: '#f00' } }} />
      </div>
      <canvas 
        ref={canvasRef} 
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: -1
        }}
      />
    </>
  );
}
