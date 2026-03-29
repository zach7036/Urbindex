'use client';

import { useEffect, useRef, useState } from 'react';

interface ComparisonBarProps {
  label: string;
  value: number;
  maxValue: number;
  nationalAvg?: number;
  format: 'currency' | 'percent' | 'number' | 'score';
  color?: string;
}

export default function ComparisonBar({ label, value, maxValue, nationalAvg, format, color }: ComparisonBarProps) {
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setAnimated(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const pct = Math.min((value / maxValue) * 100, 100);
  const avgPct = nationalAvg ? Math.min((nationalAvg / maxValue) * 100, 100) : undefined;

  const formatVal = (v: number): string => {
    if (v === undefined || v === null) return 'N/A';
    switch (format) {
      case 'currency': return `$${v.toLocaleString()}`;
      case 'percent': return `${v.toFixed(1)}%`;
      case 'score': return `${Math.round(v)}`;
      case 'number':
      default: return v.toLocaleString();
    }
  };

  return (
    <div className="comparison-bar-container" ref={ref}>
      <div className="comparison-bar-label">
        <span className="comparison-bar-name">{label}</span>
        <span className="comparison-bar-value">{formatVal(value)}</span>
      </div>
      <div className="comparison-bar-track">
        <div
          className="comparison-bar-fill"
          style={{
            width: animated ? `${pct}%` : '0%',
            background: color || 'var(--gradient-accent)',
          }}
        />
        {avgPct !== undefined && (
          <div
            className="comparison-bar-marker"
            style={{ left: `${avgPct}%` }}
          >
            <div className="comparison-bar-marker-label">Nat&apos;l Avg</div>
          </div>
        )}
      </div>
    </div>
  );
}
