import { Metadata } from 'next';
import CostOfLivingClient from '@/components/col/CostOfLivingClient';

export const metadata: Metadata = {
  title: 'Cost of Living & Salary Calculator | Urbindex',
  description: 'See the salary you would need in another city to keep your current lifestyle — with housing costs and state income tax factored in.',
};

export default function CostOfLivingPage() {
  return (
    <div className="container" style={{ padding: 'var(--space-2xl) 0 var(--space-3xl)', maxWidth: 'var(--max-width-narrow)' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
        <h1 style={{
          fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          marginBottom: 'var(--space-sm)',
        }}>
          Cost of Living Calculator
        </h1>
        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: '1.05rem',
          maxWidth: 620,
          margin: '0 auto',
        }}>
          Moving cities? Find the salary you&apos;d need to keep the same lifestyle — housing and state income tax included.
        </p>
      </div>

      <CostOfLivingClient />
    </div>
  );
}
