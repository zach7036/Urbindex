import { Metadata } from 'next';
import MapExplorer from '@/components/map/MapExplorer';

export const metadata: Metadata = {
  title: 'City Map — Every Metric, Mapped | Urbindex',
  description: 'See any city metric mapped across the United States. Income, crime, climate, walkability, home prices and more — colored coast to coast.',
};

export default function MapPage() {
  return (
    <div className="container" style={{ padding: 'var(--space-xl) 0 var(--space-2xl)' }}>
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 'var(--space-xs)' }}>
          The Map
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem' }}>
          Pick a metric and watch it light up across every US city. Green is better, red is worse.
        </p>
      </div>
      <MapExplorer />
    </div>
  );
}
