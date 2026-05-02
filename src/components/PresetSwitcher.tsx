"use client";

import React, { useState, useEffect } from 'react';
import { PRESETS, PresetConfig } from '../data/presets';

const STORAGE_KEY = 'presets-collapsed';

interface PresetSwitcherProps {
  activePresetId: string;
  onSelect: (preset: PresetConfig) => void;
}

export const PresetSwitcher: React.FC<PresetSwitcherProps> = ({ activePresetId, onSelect }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') setCollapsed(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed, mounted]);

  // Find the active preset name for collapsed state
  const activePreset = PRESETS.find(p => p.id === activePresetId);

  return (
    <div
      className={`preset-bar glass-panel ${collapsed ? 'collapsed' : ''}`}
      data-overlay
      id="preset-switcher"
    >
      <button
        className="preset-bar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Show presets' : 'Hide presets'}
        id="preset-collapse-btn"
      >
        <span className="preset-bar-toggle-label">
          {collapsed && activePreset ? activePreset.name : 'Presets'}
        </span>
        <svg
          className={`preset-bar-chevron ${collapsed ? 'rotated' : ''}`}
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
        >
          <polyline points="2,6 5,3 8,6" />
        </svg>
      </button>
      <div className="preset-bar-content">
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
    </div>
  );
};
