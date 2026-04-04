import { Metadata } from 'next';
import AnalyticsExplorer from '@/components/analytics/AnalyticsExplorer';

export const metadata: Metadata = {
  title: 'Analytics — Rank Cities by Any Data Point | Urbindex',
  description: 'Explore and rank every US city by 60+ data points including income, crime, climate, education, walkability, and more.',
};

export default function AnalyticsPage() {
  return (
    <div className="container" style={{ padding: 'var(--space-2xl) 0 var(--space-3xl)' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
        <h1 style={{
          fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          marginBottom: 'var(--space-sm)',
        }}>
          City Analytics
        </h1>
        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: '1.05rem',
          maxWidth: 600,
          margin: '0 auto',
        }}>
          Rank every US city by any data point. Pick a metric, see the rankings.
        </p>
      </div>

      <AnalyticsExplorer />
    </div>
  );
}
