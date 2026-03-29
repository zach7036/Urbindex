'use client';

import { DollarSign, Info } from 'lucide-react';
import StatCard from './StatCard';
import ComparisonBar from './ComparisonBar';
import { CityEconomy } from '@/lib/types';
import { NATIONAL_AVERAGES } from '@/lib/constants';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface Props { data: CityEconomy; }

export default function EconomySection({ data }: Props) {
  return (
    <section className="data-section" id="economy">
      <div className="container">
        <div className="section-header">
          <div className="section-icon" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
            <DollarSign size={20} style={{ color: '#3b82f6' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 className="section-title">Economy</h2>
              <div className="section-subtitle">Income, employment, and industry</div>
            </div>
            {data.is_imputed && (
              <div className="tooltip-container" style={{ position: 'relative', display: 'inline-block' }}>
                <span className="badge badge-estimated" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>
                  <Info size={14} /> AI Estimated
                </span>
                <div className="custom-tooltip">
                  This economic data was estimated by the Urbindex AI using state-level K-Nearest Neighbors 
                  population modeling, as this exact jurisdiction was excluded by the US Census Bureau to protect survey privacy.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="stat-grid">
          <StatCard label="Median Household Income" value={data.median_household_income} format="currency"
            comparison={{ avgValue: NATIONAL_AVERAGES.median_household_income, avgLabel: "nat'l", higherIsBetter: true }} />
          <StatCard label="Per Capita Income" value={data.per_capita_income} format="currency" />
          <StatCard label="Unemployment Rate" value={data.unemployment_rate} format="percent"
            comparison={{ avgValue: NATIONAL_AVERAGES.unemployment_rate, avgLabel: "nat'l", higherIsBetter: false }} />
          <StatCard label="Poverty Rate" value={data.poverty_rate} format="percent"
            comparison={{ avgValue: NATIONAL_AVERAGES.poverty_rate, avgLabel: "nat'l", higherIsBetter: false }} />
          <StatCard label="Labor Force Participation" value={data.labor_force_participation} format="percent" />
          <StatCard label="Gini Coefficient" value={data.gini_coefficient} format="ratio" suffix="" decimals={3} />
        </div>

        <div className="grid-2" style={{ marginTop: 'var(--space-lg)' }}>
          <div className="chart-container">
            <div className="chart-title">Top Industries</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.top_industries || []} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Bar dataKey="pct" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: '0.82rem' }}
                  formatter={(val: any) => [val === undefined || val === null ? 'N/A' : `${Number(val).toFixed(1)}%`, 'Share']}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container">
            <div className="chart-title">Income Distribution</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.income_brackets || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tickFormatter={(v) => `${v}%`} />
                <Bar dataKey="pct" fill="#06d6a0" radius={[6, 6, 0, 0]} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: '0.82rem' }}
                  formatter={(val: any) => [val === undefined || val === null ? 'N/A' : `${Number(val).toFixed(1)}%`, 'Households']}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ marginTop: 'var(--space-lg)' }}>
          <div className="chart-container">
            <div className="chart-title">Income vs National Average</div>
            <ComparisonBar label="Median Household Income" value={data.median_household_income}
              maxValue={200000} nationalAvg={NATIONAL_AVERAGES.median_household_income} format="currency" />
            <ComparisonBar label="Unemployment Rate" value={data.unemployment_rate}
              maxValue={10} nationalAvg={NATIONAL_AVERAGES.unemployment_rate} format="percent"
              color="linear-gradient(135deg, #f59e0b, #ef4444)" />
            <ComparisonBar label="Poverty Rate" value={data.poverty_rate}
              maxValue={25} nationalAvg={NATIONAL_AVERAGES.poverty_rate} format="percent"
              color="linear-gradient(135deg, #f59e0b, #ef4444)" />
          </div>
        </div>

        <div className="data-source">
          <span className="data-source-dot" />
          Source: US Census Bureau ACS &amp; Bureau of Labor Statistics, 2023
        </div>
      </div>
    </section>
  );
}
