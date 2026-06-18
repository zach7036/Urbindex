import { Metadata } from 'next';
import DiscoverExplorer from '@/components/map/DiscoverExplorer';

export const metadata: Metadata = {
  title: 'Discover Cities Near You — Radius Search | Urbindex',
  description: 'Drop a pin anywhere, set a radius, and find the best-ranked cities within driving distance — by livability, affordability, safety and more.',
};

export default function DiscoverPage() {
  return (
    <div className="container" style={{ padding: 'var(--space-xl) 0 var(--space-2xl)' }}>
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 'var(--space-xs)' }}>
          Discover Nearby
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem' }}>
          Anchor to a spot — your job, a city, your location — set a radius, and rank every city inside it.
        </p>
      </div>
      <DiscoverExplorer />
    </div>
  );
}
