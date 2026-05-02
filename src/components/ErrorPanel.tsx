"use client";

import React from 'react';

interface ErrorPanelProps {
  error: string | null;
  sourceNodeId?: string;
}

export const ErrorPanel: React.FC<ErrorPanelProps> = ({ error, sourceNodeId }) => {
  if (!error) return null;

  return (
    <div className="error-panel glass-panel" id="error-panel">
      <div className="error-panel-header">
        <svg className="error-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 011 1V8a1 1 0 01-2 0V4.5a1 1 0 011-1zM8 10a1 1 0 100 2 1 1 0 000-2z" />
        </svg>
        <span>
          Shader Error{sourceNodeId ? ` — node: ${sourceNodeId}` : ''}
        </span>
      </div>
      <pre>{error}</pre>
    </div>
  );
};
