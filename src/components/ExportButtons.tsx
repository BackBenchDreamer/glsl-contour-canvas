"use client";

import React, { useState, useRef, useCallback } from 'react';
import { CompiledShader } from '../engine/Compiler';

interface ExportButtonsProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  compiledShader: CompiledShader[] | null;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({ canvasRef, compiledShader }) => {
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleSaveFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contour-frame-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [canvasRef]);

  const handleCopyGLSL = useCallback(() => {
    if (!compiledShader || compiledShader.length === 0) return;
    // Collect all fragment shaders
    const glsl = compiledShader
      .map((pass, i) => `// === Pass ${i}: ${pass.passId} ===\n${pass.fragmentShader}`)
      .join('\n\n');

    navigator.clipboard.writeText(glsl).then(() => {
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [compiledShader]);

  return (
    <div className="export-bar" id="export-bar">
      <button className="export-btn" onClick={handleSaveFrame} title="Save current frame as PNG" id="save-frame-btn">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3" />
          <polyline points="5 7 8 10 11 7" />
          <line x1="8" y1="2" x2="8" y2="10" />
        </svg>
        Save Frame
      </button>
      <button
        className={`export-btn ${copied ? 'copied' : ''}`}
        onClick={handleCopyGLSL}
        title="Copy compiled GLSL to clipboard"
        id="copy-glsl-btn"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {copied ? (
            <polyline points="4 8 7 11 12 5" />
          ) : (
            <>
              <rect x="5" y="5" width="8" height="8" rx="1" />
              <path d="M3 11V3a1 1 0 011-1h8" />
            </>
          )}
        </svg>
        {copied ? 'Copied!' : 'Copy GLSL'}
      </button>
    </div>
  );
};
