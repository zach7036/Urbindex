import { Metadata } from 'next';
import AffordabilityExplorer from '@/components/afford/AffordabilityExplorer';

export const metadata: Metadata = {
  title: 'Where Can I Afford to Live? — Affordability Map | Urbindex',
  description: 'Enter your income and housing rules, and see every US city painted green to red by whether you can actually afford to live there — rent or buy, taxes included.',
};

export default function AffordPage() {
  return (
    <div className="container" style={{ padding: 'var(--space-xl) 0 var(--space-2xl)' }}>
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 'var(--space-xs)' }}>
          Where Can You Afford to Live?
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem' }}>
          Set your income and your rules. We paint the whole country — green where it fits your budget, red where it doesn&apos;t.
        </p>
      </div>
      <AffordabilityExplorer />
    </div>
  );
}
