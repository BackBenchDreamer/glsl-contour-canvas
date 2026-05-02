"use client";

import React from 'react';
import { PRESETS, PresetConfig } from '../data/presets';

interface PresetSwitcherProps {
  activePresetId: string;
  onSelect: (preset: PresetConfig) => void;
}

export const PresetSwitcher: React.FC<PresetSwitcherProps> = ({ activePresetId, onSelect }) => {
  return (
    <div className="preset-bar glass-panel" id="preset-switcher">
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          className={`preset-card ${activePresetId === preset.id ? 'active' : ''}`}
          onClick={() => onSelect(preset)}
          title={preset.description}
          id={`preset-${preset.id}`}
        >
          <div
            className="preset-thumb"
            style={{ background: preset.thumbGradient }}
          />
          <span className="preset-label">{preset.name}</span>
        </button>
      ))}
    </div>
  );
};
