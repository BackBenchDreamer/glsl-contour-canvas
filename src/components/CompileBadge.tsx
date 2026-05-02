"use client";

import React, { useEffect, useState, useRef } from 'react';

interface CompileBadgeProps {
  /** Increment this counter to trigger a flash */
  compileCount: number;
}

export const CompileBadge: React.FC<CompileBadgeProps> = ({ compileCount }) => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevCount = useRef(compileCount);

  useEffect(() => {
    if (compileCount !== prevCount.current) {
      prevCount.current = compileCount;
      setVisible(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setVisible(false);
      }, 500);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [compileCount]);

  return (
    <div className={`compile-badge glass-panel ${visible ? 'visible' : ''}`} id="compile-badge">
      <span className="badge-dot" />
      Compiling shader…
    </div>
  );
};
