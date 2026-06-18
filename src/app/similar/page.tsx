import { Metadata } from 'next';
import SimilarClient from '@/components/similar/SimilarClient';

export const metadata: Metadata = {
  title: 'Find Similar Cities — City DNA | Urbindex',
  description: 'Find cities that feel like the one you love — then filter for cheaper, bigger, smaller, warmer, or safer. Powered by Urbindex city data.',
};

export default async function SimilarPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const sp = await searchParams;
  const initialFips = typeof sp.city === 'string' ? sp.city : null;

  return (
    <div className="container" style={{ padding: 'var(--space-2xl) 0 var(--space-3xl)' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
        <h1 style={{
          fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          marginBottom: 'var(--space-sm)',
        }}>
          Find Cities Like…
        </h1>
        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: '1.05rem',
          maxWidth: 640,
          margin: '0 auto',
        }}>
          Love a city but it&apos;s too pricey or too far? Pick it, and we&apos;ll find its closest twins across the country.
        </p>
      </div>

      <SimilarClient initialFips={initialFips} />
    </div>
  );
}
