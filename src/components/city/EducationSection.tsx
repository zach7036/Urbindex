'use client';

import { GraduationCap, Info } from 'lucide-react';
import StatCard from './StatCard';
import { CityEducation } from '@/lib/types';
import { NATIONAL_AVERAGES } from '@/lib/constants';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface Props { data: CityEducation; }

export default function EducationSection({ data }: Props) {
  const attainmentData = [
    { name: 'High School', value: data.high_school_grad_pct },
    { name: "Bachelor's", value: data.bachelors_pct },
    { name: 'Graduate', value: data.graduate_pct },
  ];

  return (
    <section className="data-section" id="education">
      <div className="container">
        <div className="section-header">
          <div className="section-icon" style={{ background: 'rgba(139, 92, 246, 0.15)' }}>
            <GraduationCap size={20} style={{ color: '#8b5cf6' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 className="section-title">Education</h2>
              <div className="section-subtitle">Schools, graduation rates, and resources</div>
            </div>
            {data.is_imputed && (
              <div className="tooltip-container" style={{ position: 'relative', display: 'inline-block' }}>
                <span className="badge badge-estimated" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>
                  <Info size={14} /> AI Estimated
                </span>
                <div className="custom-tooltip">
                  This local educational profile was estimated by the Urbindex AI using K-Nearest Neighbors 
                  demographic modeling, as this exact jurisdiction was excluded by the US Census Bureau to protect survey privacy.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="stat-grid">
          <StatCard label="Bachelor's Degree +" value={data.bachelors_pct} format="percent"
            comparison={{ avgValue: NATIONAL_AVERAGES.bachelors_pct, avgLabel: "nat'l", higherIsBetter: true }} />
          <StatCard label="High School Grad" value={data.high_school_grad_pct} format="percent" />
          <StatCard label="Graduate Degree" value={data.graduate_pct} format="percent" />
        </div>

        <div className="grid-2" style={{ marginTop: 'var(--space-lg)' }}>
          <div className="chart-container">
            <div className="chart-title">Educational Attainment</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={attainmentData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `${v}%`} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: '0.82rem' }}
                  formatter={(val: any) => [val === undefined || val === null ? 'N/A' : `${Number(val).toFixed(1)}%`, '']}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container">
            <div className="chart-title">Universities &amp; Colleges</div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 'var(--space-md)',
              maxHeight: '280px', overflowY: 'auto',
              paddingRight: (data.universities || []).length > 4 ? '4px' : '0',
            }}>
              {(data.universities || []).length > 0 ? (
                (data.universities || []).map(u => (
                  <div key={u.name} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: 'var(--color-bg-glass)', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    flexShrink: 0,
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{u.type}</div>
                    </div>
                    {u.enrollment > 0 && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-accent)', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                        {u.enrollment?.toLocaleString()} students
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: '0.9rem', padding: 'var(--space-md)', textAlign: 'center' }}>
                  No colleges or universities in this city
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="data-source">
          <span className="data-source-dot" />
          Source: US Census Bureau ACS &amp; NCES, 2023
        </div>
      </div>
    </section>
  );
}
