import { Metadata } from 'next';
import { Suspense } from 'react';
import CompareClient from '@/components/compare/CompareClient';

export const metadata: Metadata = {
  title: 'Compare Cities Side-by-Side | Urbindex',
  description: 'Compare multiple US cities across demographics, economy, housing, climate, safety, education, and livability metrics in one view.',
};

export default function ComparePage() {
  return (
    <div className="container" style={{ padding: 'var(--space-3xl) 0' }}>
      <Suspense fallback={
        <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--color-text-tertiary)' }}>
          Loading comparison tool...
        </div>
      }>
        <CompareClient />
      </Suspense>
    </div>
  );
}
