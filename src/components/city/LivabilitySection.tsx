'use client';

import { Map, Info, Compass } from 'lucide-react';
import StatCard from './StatCard';
import { CityLivability } from '@/lib/types';
import { NATIONAL_AVERAGES } from '@/lib/constants';
import { getScoreColor, getScoreLabel, getAQILabel, getAQIColor } from '@/lib/utils';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const COMMUTE_COLORS = ['#3b82f6', '#06d6a0', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b'];

interface Props { data: CityLivability; }

export default function LivabilitySection({ data }: Props) {
  const commuteData = [
    { name: 'Drove Alone', value: data.commute_mode?.drove_alone || 0 },
    { name: 'Carpooled', value: data.commute_mode?.carpooled || 0 },
    { name: 'Public Transit', value: data.commute_mode?.public_transit || 0 },
    { name: 'Walked', value: data.commute_mode?.walked || 0 },
    { name: 'Work from Home', value: data.commute_mode?.worked_from_home || 0 },
    { name: 'Other', value: data.commute_mode?.other || 0 },
  ].filter(d => d.value >= 1);

  return (
    <section className="data-section" id="livability">
      <div className="container">
        <div className="section-header">
          <div className="section-icon" style={{ background: 'rgba(236, 72, 153, 0.15)' }}>
            <Compass size={20} style={{ color: '#ec4899' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 className="section-title">Livability</h2>
              <div className="section-subtitle">Amenities, transit, and daily life</div>
            </div>
            {data.is_imputed && (
              <div className="tooltip-container" style={{ position: 'relative', display: 'inline-block' }}>
                <span className="badge badge-estimated" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>
                  <Info size={14} /> AI Estimated
                </span>
                <div className="custom-tooltip">
                  This local livability profile was estimated by the Urbindex AI using K-Nearest Neighbors 
                  demographic modeling, as this exact jurisdiction was excluded by the authoritative survey sources.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Score Cards Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          {[
            { label: 'Walkability', value: data.walkscore },
            { label: 'Transit', value: data.transit_score },
            { label: 'Bikeability', value: data.bike_score },
          ].map(score => (
            <div key={score.label} className="chart-container" style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: getScoreColor(score.value), lineHeight: 1 }}>
                {score.value}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 6 }}>{score.label}</div>
              <div className={`badge ${score.value >= 70 ? 'badge-success' : score.value >= 50 ? 'badge-info' : score.value >= 30 ? 'badge-warning' : 'badge-danger'}`}
                style={{ marginTop: 8 }}>
                {getScoreLabel(score.value)}
              </div>
            </div>
          ))}
        </div>

        <div className="stat-grid">
          <StatCard label="Avg Commute Time" value={data.commute_time_avg} format="number" suffix=" min"
            comparison={{ avgValue: NATIONAL_AVERAGES.commute_time_avg, avgLabel: "nat'l", higherIsBetter: false }} />
          <StatCard label="Broadband Access" value={data.broadband_pct} format="percent" />
          <div className="stat-card">
            <div className="stat-label">Air Quality (AQI)</div>
            <div className="stat-value" style={{ color: getAQIColor(data.aqi_avg) }}>{data.aqi_avg}</div>
            <span className={`badge ${data.aqi_avg <= 50 ? 'badge-success' : data.aqi_avg <= 100 ? 'badge-warning' : 'badge-danger'}`}>
              {getAQILabel(data.aqi_avg)}
            </span>
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 'var(--space-lg)' }}>
          <div className="chart-container">
            <div className="chart-title">How People Commute</div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={commuteData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={90} innerRadius={50} paddingAngle={2} strokeWidth={0}>
                  {commuteData.map((_, idx) => (
                    <Cell key={idx} fill={COMMUTE_COLORS[idx % COMMUTE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: '0.82rem' }}
                  formatter={(val: unknown) => [`${Number(val).toFixed(1)}%`, '']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', justifyContent: 'center' }}>
              {commuteData.map((d, idx) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: COMMUTE_COLORS[idx] }} />
                  {d.name} ({d.value.toFixed(1)}%)
                </div>
              ))}
            </div>
          </div>

          <div className="chart-container">
            <div className="chart-title">Quality of Life Amenities</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', padding: 'var(--space-md) 0' }}>
              {[
                { label: 'Parks per 10K residents', value: data.parks_per_capita, icon: '🌳' },
                { label: 'Hospitals per 100K residents', value: data.hospitals_per_capita, icon: '🏥' },
                { label: 'Grocery Stores per 10K', value: data.grocery_stores_per_capita, icon: '🛒' },
              ].map(item => (
                <div key={item.label} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                  padding: 'var(--space-md)',
                  background: 'var(--color-bg-glass)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                }}>
                  <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>{item.label}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                    {item.value === undefined || item.value === null ? 'N/A' : item.value.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="data-source">
          <span className="data-source-dot" />
          Source: OpenStreetMap, EPA AirNow, US Census Bureau, 2023
        </div>
      </div>
    </section>
  );
}
