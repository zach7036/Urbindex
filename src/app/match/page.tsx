import { Metadata } from 'next';
import MatchEngine from '@/components/match/MatchEngine';

export const metadata: Metadata = {
  title: 'Where Should I Live? — Personalized City Match | Urbindex',
  description: 'Tell us what matters to you — budget, safety, weather, walkability, jobs — and we rank every US city by how well it fits your life.',
};

export default function MatchPage() {
  return (
    <div className="container" style={{ padding: 'var(--space-2xl) 0 var(--space-3xl)' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
        <h1 style={{
          fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          marginBottom: 'var(--space-sm)',
        }}>
          Where Should You Live?
        </h1>
        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: '1.05rem',
          maxWidth: 640,
          margin: '0 auto',
        }}>
          Set what matters to you. We score every US city on your priorities and rank your best matches.
        </p>
      </div>

      <MatchEngine />
    </div>
  );
}
