'use client';

import { Shield, Info } from 'lucide-react';
import StatCard from './StatCard';
import ComparisonBar from './ComparisonBar';
import { CitySafety } from '@/lib/types';
import { NATIONAL_AVERAGES } from '@/lib/constants';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface Props { data: CitySafety; }

export default function SafetySection({ data }: Props) {
  const crimeData = [
    { name: 'Murder', value: data.crime_breakdown?.murder || 0 },
    { name: 'Robbery', value: data.crime_breakdown?.robbery || 0 },
    { name: 'Assault', value: data.crime_breakdown?.aggravated_assault || 0 },
    { name: 'Burglary', value: data.crime_breakdown?.burglary || 0 },
    { name: 'Larceny', value: data.crime_breakdown?.larceny || 0 },
    { name: 'Vehicle Theft', value: data.crime_breakdown?.motor_vehicle_theft || 0 },
  ];

  const trendLabel = data.crime_trend === 'decreasing' ? '↓ Decreasing' :
    data.crime_trend === 'increasing' ? '↑ Increasing' : 
    data.is_imputed ? '✨ AI Estimated' : '→ Stable';
    
  const trendClass = data.crime_trend === 'decreasing' ? 'badge-success' :
    data.crime_trend === 'increasing' ? 'badge-danger' : 
    data.is_imputed ? 'badge-estimated' : 'badge-warning';

  return (
    <section className="data-section" id="safety">
      <div className="container">
        <div className="section-header">
          <div className="section-icon" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
            <Shield size={20} style={{ color: '#ef4444' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 className="section-title">Safety</h2>
              <div className="section-subtitle">Crime rates and public safety</div>
            </div>
            {data.is_imputed && (
              <div className="tooltip-container" style={{ position: 'relative', display: 'inline-block' }}>
                <span className="badge badge-estimated" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>
                  <Info size={14} /> AI Estimated
                </span>
                <div className="custom-tooltip">
                  This safety score was estimated by the Urbindex AI using K-Nearest Neighbors 
                  socio-economic demographic modeling, as this exact jurisdiction was excluded by the FBI Uniform Crime Report.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="stat-grid">
          <StatCard label="Violent Crime Rate" value={data.violent_crime_rate} format="number" suffix="/100K"
            comparison={{ avgValue: NATIONAL_AVERAGES.violent_crime_rate, avgLabel: "nat'l", higherIsBetter: false }} />
          <StatCard label="Property Crime Rate" value={data.property_crime_rate} format="number" suffix="/100K"
            comparison={{ avgValue: NATIONAL_AVERAGES.property_crime_rate, avgLabel: "nat'l", higherIsBetter: false }} />
          <div className="stat-card">
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Safety Score
              {data.is_imputed && <Info size={14} style={{ color: 'var(--color-estimated)', opacity: 0.7 }} />}
            </div>
            <div className="stat-value" style={{
              color: data.safety_score >= 70 ? 'var(--color-success)' : data.safety_score >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'
            }}>
              {data.safety_score}/100
            </div>
            <span className={`badge ${trendClass}`}>{trendLabel}</span>
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 'var(--space-lg)' }}>
          <div className="chart-container">
            <div className="chart-title">Crime Breakdown (per 100K residents)</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={crimeData} layout="vertical" barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Bar dataKey="value" fill="#ef4444" radius={[0, 6, 6, 0]} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: '0.82rem' }}
                  formatter={(val: any) => [`${Number(val).toFixed(1)} per 100K`, '']}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container">
            <div className="chart-title">vs National Average</div>
            <div style={{ padding: 'var(--space-md) 0' }}>
              <ComparisonBar label="Violent Crime" value={data.violent_crime_rate} maxValue={1200}
                nationalAvg={NATIONAL_AVERAGES.violent_crime_rate} format="number"
                color="linear-gradient(135deg, #ef4444, #f59e0b)" />
              <ComparisonBar label="Property Crime" value={data.property_crime_rate} maxValue={7000}
                nationalAvg={NATIONAL_AVERAGES.property_crime_rate} format="number"
                color="linear-gradient(135deg, #ef4444, #f59e0b)" />
            </div>
          </div>
        </div>

        <div className="data-source">
          <span className="data-source-dot" />
          Source: FBI Uniform Crime Report, 2023
        </div>
      </div>
    </section>
  );
}
