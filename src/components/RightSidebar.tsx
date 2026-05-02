"use client";

import React, { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sidebar-open';

interface RightSidebarProps {
  children: React.ReactNode;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    // Default open unless explicitly closed
    if (saved === 'false') setIsOpen(false);
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(STORAGE_KEY, String(isOpen));
      if (isOpen) {
        document.body.classList.remove('sidebar-closed');
      } else {
        document.body.classList.add('sidebar-closed');
      }
    }
  }, [isOpen, mounted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove('sidebar-closed');
    };
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return (
    <div
      className={`right-sidebar ${isOpen ? 'open' : ''}`}
      id="right-sidebar"
    >
      {/* Toggle button — left edge, vertically centered */}
      <button
        className="sidebar-toggle"
        onClick={toggle}
        title={isOpen ? 'Close sidebar' : 'Open sidebar'}
        id="sidebar-toggle-btn"
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isOpen ? '›' : '‹'}
      </button>

      {/* Sidebar content */}
      <div className="sidebar-content">
        {children}
      </div>
    </div>
  );
};
