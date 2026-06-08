'use client';

import { MapPin, Users, Thermometer, Navigation } from 'lucide-react';
import { formatNumberFull, formatCurrencyFull, getCityClassLabel } from '@/lib/utils';
import { CityProfile } from '@/lib/types';

interface CityHeaderProps {
  profile: CityProfile;
}

export default function CityHeader({ profile }: CityHeaderProps) {
  const { city, demographics, economy, housing, climate } = profile;

  return (
    <div className="city-hero">
      <div className="container">
        <div className="city-hero-content">
          <div className="city-name-row">
            <h1 className="city-name">{city.name}</h1>
            <span className="city-state">{city.state}</span>
          </div>

          <div className="city-meta">
            <div className="city-meta-item">
              <MapPin size={16} />
              {city.county}
            </div>
            <div className="city-meta-item">
              <Users size={16} />
              <span className={`badge badge-${city.city_class === 'large' ? 'large' : city.city_class === 'mid' ? 'info' : 'neutral'}`}>
                {getCityClassLabel(city.city_class)}
              </span>
            </div>
            <div className="city-meta-item">
              <Navigation size={16} />
              {city.latitude?.toFixed(4) ?? '0.0000'}°N, {city.longitude !== undefined && city.longitude !== null ? Math.abs(city.longitude).toFixed(4) : '0.0000'}°W
            </div>
            <div className="city-meta-item">
              <Thermometer size={16} />
              {climate.avg_high_jul != null ? `${Math.round(climate.avg_high_jul)}°F` : 'N/A'} summer · {climate.avg_low_jan != null ? `${Math.round(climate.avg_low_jan)}°F` : 'N/A'} winter
            </div>
          </div>

          <div className="city-quick-stats">
            <div className="quick-stat">
              <div className="quick-stat-label">Population</div>
              <div className="quick-stat-value">{formatNumberFull(demographics.total_population)}</div>
              <div className="quick-stat-sub">
                {demographics.population_growth_rate != null
                  ? `${demographics.population_growth_rate > 0 ? '+' : ''}${demographics.population_growth_rate}% growth`
                  : '—'}
              </div>
            </div>
            <div className="quick-stat">
              <div className="quick-stat-label">Median Income</div>
              <div className="quick-stat-value">{formatCurrencyFull(economy.median_household_income)}</div>
              <div className="quick-stat-sub">per household</div>
            </div>
            <div className="quick-stat">
              <div className="quick-stat-label">Median Home</div>
              <div className="quick-stat-value">{formatCurrencyFull(housing.median_home_value)}</div>
              <div className="quick-stat-sub">
                {housing.yoy_appreciation != null
                  ? `${housing.yoy_appreciation > 0 ? '+' : ''}${housing.yoy_appreciation}% YoY`
                  : '—'}
              </div>
            </div>
            <div className="quick-stat">
              <div className="quick-stat-label">Median Rent</div>
              <div className="quick-stat-value">{formatCurrencyFull(housing.median_rent)}</div>
              <div className="quick-stat-sub">per month</div>
            </div>
            <div className="quick-stat">
              <div className="quick-stat-label">Walkability</div>
              <div className="quick-stat-value">{profile.livability.walkscore}</div>
              <div className="quick-stat-sub">out of 100</div>
            </div>
          </div>

          {profile.computed_scores && (
            <div className="computed-scores-showcase" style={{ marginTop: 'var(--space-xl)', paddingTop: 'var(--space-xl)', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--gradient-accent)', display: 'inline-block' }}></span>
                Urbindex AI Scores
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)' }}>
                
                <div className="quick-stat" style={{ borderLeft: '4px solid var(--color-success)', background: 'rgba(6, 214, 160, 0.05)' }}>
                  <div className="quick-stat-label">Overall Livability</div>
                  <div className="quick-stat-value" style={{ color: 'var(--color-success)' }}>{profile.computed_scores.overall_livability}</div>
                  <div className="quick-stat-sub">Master metric</div>
                </div>

                <div className="quick-stat" style={{ borderLeft: '4px solid #f59e0b', background: 'rgba(245, 158, 11, 0.05)' }}>
                  <div className="quick-stat-label">Affordability</div>
                  <div className="quick-stat-value" style={{ color: '#f59e0b' }}>{profile.computed_scores.affordability_index}</div>
                  <div className="quick-stat-sub">Local purchasing power</div>
                </div>

                <div className="quick-stat" style={{ borderLeft: '4px solid #3b82f6', background: 'rgba(59, 130, 246, 0.05)' }}>
                  <div className="quick-stat-label">City Pulse Score</div>
                  <div className="quick-stat-value" style={{ color: '#3b82f6' }}>{profile.computed_scores.cultural_density_index}</div>
                  <div className="quick-stat-sub">Education & Amenities</div>
                </div>

                <div className="quick-stat" style={{ borderLeft: '4px solid var(--color-estimated)', background: 'rgba(168, 85, 247, 0.05)' }}>
                  <div className="quick-stat-label">Hidden Gem Score</div>
                  <div className="quick-stat-value" style={{ color: 'var(--color-estimated)' }}>{profile.computed_scores.hidden_gem_score}</div>
                  <div className="quick-stat-sub">High value, low density</div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
