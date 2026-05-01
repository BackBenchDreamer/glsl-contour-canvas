"use client";

import React, { useEffect, useRef, useState } from 'react';
import { WebGLRenderer } from './WebGLRenderer';
import { CompiledShader } from '../engine/Compiler';

interface EngineCanvasProps {
  compiledShader: CompiledShader[] | null;
  uniforms: Record<string, any>;
  className?: string;
  onFrame?: (renderer: WebGLRenderer) => void;
}

export const EngineCanvas: React.FC<EngineCanvasProps> = ({ compiledShader, uniforms, className, onFrame }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Initialize renderer
    if (!rendererRef.current) {
      rendererRef.current = new WebGLRenderer(canvasRef.current);
      // Setup resize observer
      const observer = new ResizeObserver((entries) => {
        for (let entry of entries) {
          const { width, height } = entry.contentRect;
          rendererRef.current?.resize(width * window.devicePixelRatio, height * window.devicePixelRatio);
        }
      });
      observer.observe(canvasRef.current.parentElement!);
      
      return () => {
        observer.disconnect();
        rendererRef.current?.stopLoop();
      };
    }
  }, []);

  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (rendererRef.current && compiledShader) {
      try {
        rendererRef.current.setShaders(compiledShader);
        rendererRef.current.startLoop((r) => {
          if (onFrameRef.current) onFrameRef.current(r);
        });
      } catch (e) {
        console.error("Failed to compile shader:", e);
      }
    }
  }, [compiledShader]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.updateUniforms(uniforms);
    }
  }, [uniforms]);

  return (
    <canvas 
      ref={canvasRef} 
      className={className} 
      style={{ width: '100%', height: '100%', display: 'block' }} 
    />
  );
};
