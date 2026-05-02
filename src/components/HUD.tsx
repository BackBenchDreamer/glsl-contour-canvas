"use client";

import React from 'react';

export const HUD: React.FC = () => {
  return (
    <div className="hud-overlay glass-panel" id="hud-overlay">
      <h1>Node Contour Engine</h1>
      <div className="hud-subtitle">Runtime GLSL Graph Compiler</div>
      <p className="hud-description">
        A runtime GLSL compiler that turns a node graph into live WebGL2 shaders.
      </p>
      <ul className="hud-features">
        <li>
          <span>
            <span className="feature-label">Dynamic multi-pass compilation</span> — only includes used nodes &amp; dependencies
          </span>
        </li>
        <li>
          <span>
            <span className="feature-label">Ping-pong framebuffers</span> — temporal effects like decay, diffusion &amp; reaction-diffusion
          </span>
        </li>
        <li>
          <span>
            <span className="feature-label">Typed DAG validation</span> — strict FieldType checking with cycle detection
          </span>
        </li>
      </ul>
      <a
        href="https://github.com/BackBenchDreamer/glsl-contour-canvas"
        target="_blank"
        rel="noopener noreferrer"
        className="hud-link"
      >
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        View source on GitHub
      </a>
    </div>
  );
};
