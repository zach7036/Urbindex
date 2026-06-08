import Link from 'next/link';
import CitySearch from '@/components/search/CitySearch';
import { createServiceClient } from '@/lib/supabase';
import { formatNumber, formatCurrency, getCityUrl } from '@/lib/utils';
import { Database, BarChart3, MapPin, Zap, Star } from 'lucide-react';

export const revalidate = 86400; // Cache 24 hours

export default async function HomePage() {
  const supabase = createServiceClient();
  const seedFips = ['3755000', '4805000', '0667000', '1714000', '1304000', '0820000', '4752006', '5363000'];
  const { data: rawCities } = await supabase.from('cities')
    .select(`
      fips_code, name, state_code, slug, population,
      city_economy(median_household_income),
      city_housing(median_home_value),
      city_livability(walkscore),
      city_computed_scores(overall_livability)
    `)
    .in('fips_code', seedFips);

  // Safely extract singular nested objects or arrays depending on Supabase version returned
  const realCities = rawCities?.map((c: any) => ({
    fips_code: c.fips_code,
    name: c.name,
    state_code: c.state_code,
    slug: c.slug,
    population: c.population,
    income: (Array.isArray(c.city_economy) ? c.city_economy[0] : c.city_economy)?.median_household_income || 0,
    homeValue: (Array.isArray(c.city_housing) ? c.city_housing[0] : c.city_housing)?.median_home_value || 0,
    walkscore: (Array.isArray(c.city_livability) ? c.city_livability[0] : c.city_livability)?.walkscore || 0,
    livability: (Array.isArray(c.city_computed_scores) ? c.city_computed_scores[0] : c.city_computed_scores)?.overall_livability || 0,
  })) || [];

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <div className="hero-badge">
              <Database size={12} />
              Powered by public data
            </div>
            <h1 className="hero-title">
              Every US city.<br />Every data point.<br />One platform.
            </h1>
            <p className="hero-subtitle">
              Urbindex aggregates demographics, economy, housing, climate, safety, education,
              and livability data for every major US city — so you can finally answer:
              <em style={{ color: 'var(--color-accent)' }}> What is it actually like to live there?</em>
            </p>
            <div style={{ maxWidth: 560, margin: '0 auto' }}>
              <CitySearch large />
            </div>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section style={{ padding: 'var(--space-3xl) 0', borderBottom: '1px solid var(--color-border)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-xl)' }}>
            {[
              {
                icon: <Database size={24} />,
                title: '20+ Data Dimensions',
                desc: 'Demographics, economy, housing, climate, crime, education, walkability, air quality, and more — all from authoritative public sources.',
              },
              {
                icon: <BarChart3 size={24} />,
                title: 'Contextual Comparisons',
                desc: 'Every metric is shown alongside national and state averages. Instantly see how a city stacks up.',
              },
              {
                icon: <MapPin size={24} />,
                title: '1,500+ Cities',
                desc: 'Every US city with population over 10,000 gets a comprehensive, data-rich profile.',
              },
              {
                icon: <Zap size={24} />,
                title: 'Original Insights',
                desc: 'Computed scores like affordability index, city pulse score, and economic resilience — found nowhere else.',
              },
            ].map((item, idx) => (
              <div key={idx} style={{
                padding: 'var(--space-xl)',
                background: 'var(--gradient-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                transition: 'all var(--transition-base)',
              }}>
                <div style={{
                  width: 48, height: 48,
                  background: 'var(--color-accent-dim)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-accent)',
                  marginBottom: 'var(--space-md)',
                }}>
                  {item.icon}
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>{item.title}</h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Cities */}
      <section style={{ padding: 'var(--space-3xl) 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 'var(--space-sm)' }}>
              Explore Cities
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem' }}>
              Dive into comprehensive data profiles for major US cities
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 'var(--space-lg)',
          }}>
            {realCities.map(city => (
              <Link
                key={city.fips_code}
                href={getCityUrl(city.state_code, city.slug)}
                className="city-card"
                style={{ position: 'relative', overflow: 'hidden' }}
              >
                <div style={{ 
                  position: 'absolute', top: 0, right: 0, 
                  padding: '6px 14px', 
                  background: 'var(--color-success)', 
                  color: '#fff', 
                  fontWeight: 800, 
                  fontSize: '1.1rem', 
                  borderBottomLeftRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Star size={16} fill="currentColor" />
                  {city.livability}
                </div>
                <div className="city-card-name" style={{ paddingRight: 60 }}>{city.name}</div>
                <div className="city-card-state">{city.state_code}</div>
                <div className="city-card-stats" style={{ marginTop: 'var(--space-md)' }}>
                  <div className="city-card-stat">
                    Population
                    <span>{formatNumber(city.population)}</span>
                  </div>
                  <div className="city-card-stat">
                    Median Income
                    <span>{formatCurrency(city.income)}</span>
                  </div>
                  <div className="city-card-stat">
                    Home Value
                    <span>{formatCurrency(city.homeValue)}</span>
                  </div>
                  <div className="city-card-stat">
                    Walkability
                    <span>{city.walkscore}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Data Sources */}
      <section style={{
        padding: 'var(--space-2xl) 0',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg-secondary)',
      }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.82rem', marginBottom: 'var(--space-md)' }}>
            DATA SOURCED FROM
          </p>
          <div style={{
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 'var(--space-lg)',
            color: 'var(--color-text-secondary)', fontSize: '0.9rem', fontWeight: 500,
          }}>
            {['US Census Bureau', 'Bureau of Labor Statistics', 'NOAA', 'FBI', 'EPA', 'OpenStreetMap', 'FEMA', 'HUD'].map(source => (
              <span key={source} style={{ opacity: 0.7 }}>{source}</span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
