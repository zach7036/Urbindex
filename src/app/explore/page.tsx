import { Metadata } from 'next';
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase';
import { getCityUrl, formatNumberFull } from '@/lib/utils';
import { Shield, DollarSign, Locate, Star } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Explore Top Cities | Urbindex',
  description: 'Discover the safest, most affordable, and most livable cities across the United States.',
};

export const revalidate = 86400; // Cache for 24 hours

export default async function ExplorePage() {
  const supabase = createServiceClient();
  
  // Query relationships using PostgREST syntax
  const [liveRes, affordRes, gemRes, cultureRes] = await Promise.all([
    supabase.from('city_computed_scores')
      .select('fips_code, overall_livability, cities(name, state_code, slug, population)')
      .order('overall_livability', { ascending: false }).limit(8),
    supabase.from('city_computed_scores')
      .select('fips_code, affordability_index, cities(name, state_code, slug, population)')
      .order('affordability_index', { ascending: false }).limit(8),
    supabase.from('city_computed_scores')
      .select('fips_code, hidden_gem_score, cities(name, state_code, slug, population)')
      .order('hidden_gem_score', { ascending: false }).limit(8),
    supabase.from('city_computed_scores')
      .select('fips_code, cultural_density_index, cities(name, state_code, slug, population)')
      .order('cultural_density_index', { ascending: false }).limit(8),
  ]);

  const sections = [
    { title: 'Top Overall Livability', icon: Star, data: liveRes.data, metric: 'overall_livability', color: 'var(--color-success)' },
    { title: 'Highest City Pulse Score', icon: Locate, data: cultureRes.data, metric: 'cultural_density_index', color: 'var(--color-info)' },
    { title: 'Hidden Gems (Quiet & Safe)', icon: Shield, data: gemRes.data, metric: 'hidden_gem_score', color: 'var(--color-estimated)' },
    { title: 'Most Affordable Cities', icon: DollarSign, data: affordRes.data, metric: 'affordability_index', color: 'var(--color-warning)' },
  ];

  return (
    <div className="container" style={{ padding: 'var(--space-3xl) 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 'var(--space-sm)' }}>
          Explore Cities
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', maxWidth: 600, margin: '0 auto' }}>
          Discover the top-ranked locations in the country based on Urbindex&apos;s proprietary AI data metrics.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3xl)' }}>
        {sections.map((section, idx) => (
          <section key={section.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', paddingBottom: 'var(--space-md)', borderBottom: '1px solid var(--color-border)' }}>
              <section.icon size={28} style={{ color: section.color }} />
              <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{section.title}</h2>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'var(--space-lg)',
            }}>
              {section.data?.map((item: any) => {
                const cityMeta = Array.isArray(item.cities) ? item.cities[0] : item.cities;
                if (!cityMeta) return null; // In case of orphaned records
                return (
                  <Link
                    key={`explore-${idx}-${item.fips_code}`}
                    href={getCityUrl(cityMeta.state_code, cityMeta.slug)}
                    className="city-card"
                    style={{ position: 'relative', overflow: 'hidden' }}
                  >
                    <div style={{ 
                      position: 'absolute', top: 0, right: 0, 
                      padding: '8px 16px', 
                      background: section.color, 
                      color: '#fff', 
                      fontWeight: 800, 
                      fontSize: '1.2rem', 
                      borderBottomLeftRadius: 'var(--radius-md)' 
                    }}>
                      {item[section.metric]}
                    </div>
                    <div className="city-card-name" style={{ paddingRight: 50 }}>{cityMeta.name}</div>
                    <div className="city-card-state">{cityMeta.state_code}</div>
                    <div className="city-card-stats" style={{ marginTop: 'var(--space-md)' }}>
                      <div className="city-card-stat">
                        Population
                        <span style={{ fontSize: '0.9rem' }}>{formatNumberFull(cityMeta.population)}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
