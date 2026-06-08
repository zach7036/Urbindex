'use client';

import { CloudSun } from 'lucide-react';
import StatCard from './StatCard';
import { CityClimate } from '@/lib/types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface Props { data: CityClimate; }

export default function ClimateSection({ data }: Props) {
  const tempData = [
    { month: 'Jan', high: data.avg_high_jan, low: data.avg_low_jan },
    { month: 'Apr', high: data.avg_high_apr, low: data.avg_low_apr },
    { month: 'Jul', high: data.avg_high_jul, low: data.avg_low_jul },
    { month: 'Oct', high: data.avg_high_oct, low: data.avg_low_oct },
  ];

  const comfortLabel = data.comfort_index >= 75 ? 'Excellent' :
    data.comfort_index >= 60 ? 'Good' : data.comfort_index >= 45 ? 'Fair' : 'Challenging';
  const comfortColor = data.comfort_index >= 75 ? 'var(--color-success)' :
    data.comfort_index >= 60 ? 'var(--color-info)' : data.comfort_index >= 45 ? 'var(--color-warning)' : 'var(--color-danger)';

  return (
    <section className="data-section" id="climate">
      <div className="container">
        <div className="section-header">
          <div className="section-icon" style={{ background: 'rgba(14, 165, 233, 0.15)' }}>
            <CloudSun size={20} style={{ color: '#0ea5e9' }} />
          </div>
          <div>
            <h2 className="section-title">Climate</h2>
            <div className="section-subtitle">Weather patterns and comfort</div>
          </div>
        </div>

        <div className="stat-grid">
          <StatCard label="Sunny Days" value={data.sunny_days} format="number" suffix=" days" />
          <StatCard label="Annual Precipitation" value={data.annual_precipitation} format="number" suffix=" in" decimals={1} />
          <StatCard label="Annual Snowfall" value={data.annual_snowfall} format="number" suffix=" in" decimals={1} />
          <StatCard label="Days Above 90°F" value={data.days_above_90} format="number" suffix=" days" />
          <StatCard label="Days Below 32°F" value={data.days_below_32} format="number" suffix=" days" />
          <StatCard label="Avg Humidity" value={data.avg_humidity} format="number" suffix="%" />
        </div>

        <div className="grid-2" style={{ marginTop: 'var(--space-lg)' }}>
          <div className="chart-container">
            <div className="chart-title">Seasonal Temperature Range</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={tempData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" />
                <YAxis domain={['auto', 'auto']} tickFormatter={(v) => `${v}°F`} />
                <Legend />
                <Bar dataKey="high" name="Avg High" fill="#ef4444" radius={[6, 6, 0, 0]} minPointSize={1} />
                <Bar dataKey="low" name="Avg Low" fill="#3b82f6" radius={[6, 6, 0, 0]} minPointSize={1} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: '0.82rem' }}
                  formatter={(val: any) => [val === undefined || val === null ? 'N/A' : `${val}°F`, '']}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container">
            <div className="chart-title">Comfort Index</div>
            <div style={{ textAlign: 'center', padding: 'var(--space-xl) 0' }}>
              <div style={{ fontSize: '4rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: comfortColor, lineHeight: 1 }}>
                {data.comfort_index}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 8 }}>out of 100</div>
              <div className={`badge ${data.comfort_index >= 70 ? 'badge-success' : data.comfort_index >= 50 ? 'badge-info' : 'badge-warning'}`}
                style={{ marginTop: 12 }}>
                {comfortLabel}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginTop: 'var(--space-xl)', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{data.sunny_days}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Sunny Days</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{data.rainy_days}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Rainy Days</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="data-source">
          <span className="data-source-dot" />
          Source: NOAA 1991-2020 US Climate Normals
        </div>
      </div>
    </section>
  );
}
