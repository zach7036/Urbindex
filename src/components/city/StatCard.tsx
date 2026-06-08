'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrencyFull, formatPercent, formatNumberFull, formatTemperature, getComparisonLabel } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number;
  format: 'currency' | 'percent' | 'number' | 'temperature' | 'score' | 'ratio';
  comparison?: {
    avgValue: number;
    avgLabel?: string;
    higherIsBetter: boolean;
  };
  suffix?: string;
  decimals?: number;
}

export default function StatCard({ label, value, format, comparison, suffix, decimals }: StatCardProps) {
  const formatValue = (v: number): string => {
    switch (format) {
      case 'currency': return formatCurrencyFull(v);
      case 'percent': return formatPercent(v, decimals ?? 1);
      case 'temperature': return formatTemperature(v);
      case 'score': return v === undefined || v === null ? 'N/A' : `${Math.round(v)}${suffix || ''}`;
      case 'ratio': return v === undefined || v === null ? 'N/A' : `${v.toFixed(decimals ?? 2)}${suffix || 'x'}`;
      case 'number':
      default: return formatNumberFull(v) + (suffix || '');
    }
  };

  let compClass = 'neutral';
  let CompIcon = Minus;

  if (comparison) {
    const diff = value - comparison.avgValue;
    const isHigher = diff > 0;
    const better = comparison.higherIsBetter ? isHigher : !isHigher;
    const near = Math.abs(diff / comparison.avgValue) < 0.03;

    if (near) {
      compClass = 'neutral';
      CompIcon = Minus;
    } else {
      compClass = better ? 'better' : 'worse';
      CompIcon = isHigher ? TrendingUp : TrendingDown;
    }
  }

  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{formatValue(value)}</div>
      {comparison && (
        <div className={`stat-comparison ${compClass}`}>
          <CompIcon size={12} />
          {getComparisonLabel(value, comparison.avgValue)}
          {comparison.avgLabel && (
            <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>
              vs {comparison.avgLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
