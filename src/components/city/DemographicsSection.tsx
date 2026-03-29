'use client';

import { Users, Info } from 'lucide-react';
import StatCard from './StatCard';
import { CityDemographics } from '@/lib/types';
import { NATIONAL_AVERAGES } from '@/lib/constants';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const RACE_COLORS = ['#06d6a0', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

interface Props { data: CityDemographics; }

export default function DemographicsSection({ data }: Props) {
  const raceData = [
    { name: 'White', value: data.race_ethnicity?.white || 0 },
    { name: 'Black', value: data.race_ethnicity?.black || 0 },
    { name: 'Hispanic', value: data.race_ethnicity?.hispanic || 0 },
    { name: 'Asian', value: data.race_ethnicity?.asian || 0 },
    { name: 'Native American', value: data.race_ethnicity?.native_american || 0 },
    { name: 'Pacific Islander', value: data.race_ethnicity?.pacific_islander || 0 },
    { name: 'Two or More', value: data.race_ethnicity?.two_or_more || 0 },
    { name: 'Other', value: data.race_ethnicity?.other || 0 },
  ].filter(d => d.value > 0.5);

  return (
    <section className="data-section" id="demographics">
      <div className="container">
        <div className="section-header">
          <div className="section-icon"><Users size={20} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 className="section-title">Demographics</h2>
              <div className="section-subtitle">Population, age, and diversity</div>
            </div>
            {data.is_imputed && (
              <div className="tooltip-container" style={{ position: 'relative', display: 'inline-block' }}>
                <span className="badge badge-estimated" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>
                  <Info size={14} /> AI Estimated
                </span>
                <div className="custom-tooltip">
                  This detailed demographic breakdown was estimated by the Urbindex AI using K-Nearest Neighbors 
                  population modeling, as this exact jurisdiction was excluded by the US Census Bureau to protect privacy.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="stat-grid">
          <StatCard label="Total Population" value={data.total_population} format="number"
            comparison={{ avgValue: 100000, avgLabel: 'avg city', higherIsBetter: true }} />
          <StatCard label="Median Age" value={data.median_age} format="number" suffix=" yrs"
            comparison={{ avgValue: NATIONAL_AVERAGES.median_age, avgLabel: "nat'l", higherIsBetter: false }} />
          <StatCard label="Population Density" value={data.population_density} format="number" suffix="/mi²" />
          <StatCard label="Growth Rate" value={data.population_growth_rate} format="percent"
            comparison={{ avgValue: NATIONAL_AVERAGES.population_growth_rate, avgLabel: "nat'l", higherIsBetter: true }} />
          <StatCard label="Foreign Born" value={data.foreign_born_pct} format="percent" />
          <StatCard label="Veterans" value={data.veterans_pct} format="percent" />
        </div>

        <div className="grid-2" style={{ marginTop: 'var(--space-lg)' }}>
          <div className="chart-container">
            <div className="chart-title">Race &amp; Ethnicity</div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={raceData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={90} innerRadius={50} paddingAngle={2} strokeWidth={0}>
                  {raceData.map((_, idx) => (
                    <Cell key={idx} fill={RACE_COLORS[idx % RACE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: '0.82rem' }}
                  formatter={(val: any) => [val === undefined || val === null ? 'N/A' : `${Number(val).toFixed(1)}%`, '']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', justifyContent: 'center' }}>
              {raceData.map((d, idx) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: RACE_COLORS[idx] }} />
                  {d.name} ({d.value.toFixed(1)}%)
                </div>
              ))}
            </div>
          </div>

          <div className="chart-container">
            <div className="chart-title">Gender &amp; Age</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={[
                { name: 'Male', value: data.male_pct },
                { name: 'Female', value: data.female_pct },
              ]} layout="vertical" barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" domain={[0, 60]} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={60} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: '0.82rem' }}
                  formatter={(val: any) => [val === undefined || val === null ? 'N/A' : `${Number(val).toFixed(1)}%`, '']}
                />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                Median Household Size: <strong style={{ color: 'var(--color-text-primary)' }}>{data.median_household_size}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="data-source">
          <span className="data-source-dot" />
          Source: US Census Bureau, 2023 ACS 5-Year Estimates
        </div>
      </div>
    </section>
  );
}
