'use client';

import { Home, Info } from 'lucide-react';
import StatCard from './StatCard';
import ComparisonBar from './ComparisonBar';
import { CityHousing } from '@/lib/types';
import { NATIONAL_AVERAGES } from '@/lib/constants';

interface Props { data: CityHousing; }

export default function HousingSection({ data }: Props) {
  const affordabilityScore = data.price_to_income_ratio <= 3 ? 'Very Affordable' :
    data.price_to_income_ratio <= 4 ? 'Affordable' :
    data.price_to_income_ratio <= 5 ? 'Moderate' :
    data.price_to_income_ratio <= 7 ? 'Expensive' : 'Very Expensive';

  const affordabilityColor = data.price_to_income_ratio <= 3 ? 'var(--color-success)' :
    data.price_to_income_ratio <= 5 ? 'var(--color-warning)' : 'var(--color-danger)';

  return (
    <section className="data-section" id="housing">
      <div className="container">
        <div className="section-header">
          <div className="section-icon" style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
            <Home size={20} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 className="section-title">Housing</h2>
              <div className="section-subtitle">Home values, rent, and affordability</div>
            </div>
            {data.is_imputed && (
              <div className="tooltip-container" style={{ position: 'relative', display: 'inline-block' }}>
                <span className="badge badge-estimated" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>
                  <Info size={14} /> AI Estimated
                </span>
                <div className="custom-tooltip">
                  This local housing market profile was estimated by the Urbindex AI using state-level K-Nearest Neighbors 
                  population modeling, as this exact jurisdiction was excluded by the US Census Bureau to protect survey privacy.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="stat-grid">
          <StatCard label="Median Home Value" value={data.median_home_value} format="currency"
            comparison={{ avgValue: NATIONAL_AVERAGES.median_home_value, avgLabel: "nat'l", higherIsBetter: false }} />
          <StatCard label="Median Rent" value={data.median_rent} format="currency"
            comparison={{ avgValue: NATIONAL_AVERAGES.median_rent, avgLabel: "nat'l", higherIsBetter: false }} />
          <StatCard label="Homeownership Rate" value={data.homeownership_rate} format="percent"
            comparison={{ avgValue: NATIONAL_AVERAGES.homeownership_rate, avgLabel: "nat'l", higherIsBetter: true }} />
          <StatCard label="Vacancy Rate" value={data.vacancy_rate} format="percent" />
          <StatCard label="YoY Appreciation" value={data.yoy_appreciation} format="percent" suffix="%" decimals={1} />
          <StatCard label="Housing Units" value={data.housing_units} format="number" />
        </div>

        <div className="grid-2" style={{ marginTop: 'var(--space-lg)' }}>
          <div className="chart-container">
            <div className="chart-title">Affordability</div>
            <div style={{ textAlign: 'center', padding: 'var(--space-lg) 0' }}>
              <div style={{ fontSize: '3rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: affordabilityColor }}>
                {data.price_to_income_ratio === undefined || data.price_to_income_ratio === null ? 'N/A' : `${data.price_to_income_ratio.toFixed(1)}x`}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                Price-to-Income Ratio
              </div>
              <div className={`badge ${data.price_to_income_ratio <= 4 ? 'badge-success' : data.price_to_income_ratio <= 6 ? 'badge-warning' : 'badge-danger'}`}>
                {affordabilityScore}
              </div>
              <div style={{ marginTop: 'var(--space-lg)', fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>
                Rent-to-Income: <strong style={{ color: 'var(--color-text-primary)' }}>{data.rent_to_income_ratio === undefined || data.rent_to_income_ratio === null ? 'N/A' : `${data.rent_to_income_ratio.toFixed(1)}%`}</strong>
                <br />
                Cost-Burdened Households: <strong style={{ color: 'var(--color-text-primary)' }}>{data.housing_cost_burden_pct === undefined || data.housing_cost_burden_pct === null ? 'N/A' : `${data.housing_cost_burden_pct.toFixed(1)}%`}</strong>
              </div>
            </div>
          </div>

          <div className="chart-container">
            <div className="chart-title">Market Comparison</div>
            <div style={{ padding: 'var(--space-sm) 0' }}>
              <ComparisonBar label="Home Value" value={data.median_home_value} maxValue={1400000}
                nationalAvg={NATIONAL_AVERAGES.median_home_value} format="currency" />
              <ComparisonBar label="Monthly Rent" value={data.median_rent} maxValue={2500}
                nationalAvg={NATIONAL_AVERAGES.median_rent} format="currency" />
              <ComparisonBar label="Homeownership" value={data.homeownership_rate} maxValue={80}
                nationalAvg={NATIONAL_AVERAGES.homeownership_rate} format="percent" />
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
