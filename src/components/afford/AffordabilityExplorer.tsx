'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Loader2, Home, KeyRound, SlidersHorizontal, Wallet } from 'lucide-react';
import { fetchAllCityRows, getNum, CityRow } from '@/lib/cities-data';
import { monthlyMortgage, PROPERTY_TAX_INS_RATE, stateTaxRate } from '@/lib/col';
import { scoreToColor, TIER_RADIUS } from '@/components/map/color';
import { getCityUrl, formatCurrencyFull, STATE_NAMES } from '@/lib/utils';
import type { MapPoint } from '@/components/map/MetricMapCanvas';

const MetricMapCanvas = dynamic(() => import('@/components/map/MetricMapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="urbindex-map map-skeleton">
      <Loader2 size={28} className="analytics-spinner" />
      <span>Loading map…</span>
    </div>
  ),
});

type Mode = 'rent' | 'buy';

const TIERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Any size' },
  { id: 'large', label: 'Large (250K+)' },
  { id: 'mid', label: 'Mid (100–250K)' },
  { id: 'small', label: 'Small (50–100K)' },
  { id: 'micro', label: 'Micro (10–50K)' },
];

interface Scored {
  row: CityRow;
  monthly: number;
  burden: number;     // housing cost / gross income
  qualifies: boolean;
  livability: number | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function AffordabilityExplorer() {
  const [rows, setRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [income, setIncome] = useState(75000);
  const [mode, setMode] = useState<Mode>('rent');
  const [housingPct, setHousingPct] = useState(30);
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(7);
  const [term, setTerm] = useState(30);
  const [stateFilter, setStateFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [decentOnly, setDecentOnly] = useState(false);

  useEffect(() => {
    fetchAllCityRows()
      .then(setRows)
      .catch((e) => setError(e.message || 'Failed to load city data'))
      .finally(() => setLoading(false));
  }, []);

  const states = useMemo(() => [...new Set(rows.map(r => r.state_code))].sort(), [rows]);

  const threshold = housingPct / 100;
  const maxMonthlyBudget = income > 0 ? (income / 12) * threshold : 0;

  const { points, scored, qualifyingCount, totalCount } = useMemo(() => {
    const pts: MapPoint[] = [];
    const sc: Scored[] = [];
    if (income <= 0) return { points: pts, scored: sc, qualifyingCount: 0, totalCount: 0 };

    for (const r of rows) {
      if (stateFilter !== 'all' && r.state_code !== stateFilter) continue;
      if (tierFilter !== 'all' && r.city_class !== tierFilter) continue;

      const lat = getNum(r.latitude), lng = getNum(r.longitude);
      const livability = getNum(r.overall_livability);
      if (decentOnly && (livability === null || livability < 60)) continue;

      // Monthly housing cost for the chosen mode.
      let monthly: number | null = null;
      if (mode === 'rent') {
        monthly = getNum(r.median_rent);
      } else {
        const hv = getNum(r.median_home_value);
        if (hv !== null) {
          monthly = monthlyMortgage(hv, downPct, rate, term) + (hv * PROPERTY_TAX_INS_RATE) / 12;
        }
      }
      if (monthly === null || monthly <= 0) continue;

      const burden = (monthly * 12) / income;
      // Color ties to the user's threshold: at exactly your limit = amber (50),
      // comfortably under = green, over budget = red.
      const score = clamp(100 - (burden / threshold) * 50, 0, 100);
      const qualifies = burden <= threshold;

      sc.push({ row: r, monthly, burden, qualifies, livability });

      if (lat !== null && lng !== null) {
        pts.push({
          fips: r.fips_code, name: r.name, state_code: r.state_code, slug: r.slug,
          lat, lng,
          label: `${formatCurrencyFull(Math.round(monthly))}/mo · ${Math.round(burden * 100)}% of income`,
          color: scoreToColor(score),
          radius: TIER_RADIUS[r.city_class] ?? 4,
        });
      }
    }

    const qualifyingCount = sc.filter(s => s.qualifies).length;
    return { points: pts, scored: sc, qualifyingCount, totalCount: sc.length };
  }, [rows, income, mode, threshold, downPct, rate, term, stateFilter, tierFilter, decentOnly]);

  // Best places you can afford = qualifying cities ranked by livability.
  const bestAffordable = useMemo(() => {
    return scored
      .filter(s => s.qualifies)
      .sort((a, b) => (b.livability ?? -1) - (a.livability ?? -1))
      .slice(0, 50);
  }, [scored]);

  if (error) {
    return <div className="analytics-loading"><p style={{ color: 'var(--color-danger)' }}>Error: {error}</p></div>;
  }

  return (
    <div>
      {/* Controls */}
      <div className="afford-controls">
        <label className="afford-field afford-income">
          <span><Wallet size={13} /> Annual household income</span>
          <div className="col-salary-wrap" style={{ minHeight: 46 }}>
            <span>$</span>
            <input
              type="number" min={0} step={1000} value={income}
              onChange={e => setIncome(Number(e.target.value) || 0)}
              className="col-salary-input no-focus-ring" style={{ fontSize: '1.05rem' }}
            />
            <span className="col-salary-suffix">pre-tax</span>
          </div>
        </label>

        <div className="afford-field">
          <span>I plan to</span>
          <div className="afford-toggle">
            <button className={`afford-toggle-btn ${mode === 'rent' ? 'active' : ''}`} onClick={() => setMode('rent')}>
              <KeyRound size={14} /> Rent
            </button>
            <button className={`afford-toggle-btn ${mode === 'buy' ? 'active' : ''}`} onClick={() => setMode('buy')}>
              <Home size={14} /> Buy
            </button>
          </div>
        </div>

        <label className="afford-field afford-slider">
          <span>Spend up to <strong>{housingPct}%</strong> on housing</span>
          <input type="range" min={15} max={50} step={1} value={housingPct} onChange={e => setHousingPct(Number(e.target.value))} />
        </label>

        {mode === 'buy' && (
          <div className="afford-field afford-buy-params">
            <span><SlidersHorizontal size={12} /> Mortgage</span>
            <div className="afford-buy-grid">
              <label>Down %<input type="number" min={0} max={100} step={1} value={downPct} onChange={e => setDownPct(clamp(Number(e.target.value) || 0, 0, 100))} /></label>
              <label>Rate %<input type="number" min={0} max={20} step={0.1} value={rate} onChange={e => setRate(clamp(Number(e.target.value) || 0, 0, 20))} /></label>
              <label>Years<input type="number" min={5} max={40} step={5} value={term} onChange={e => setTerm(clamp(Number(e.target.value) || 30, 5, 40))} /></label>
            </div>
          </div>
        )}

        <label className="afford-field">
          <span>State</span>
          <select className="afford-select" value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="all">All states</option>
            {states.map(s => <option key={s} value={s}>{STATE_NAMES[s] || s}</option>)}
          </select>
        </label>

        <label className="afford-field">
          <span>City size</span>
          <select className="afford-select" value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
            {TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>

        <label className="afford-check">
          <input type="checkbox" checked={decentOnly} onChange={e => setDecentOnly(e.target.checked)} />
          Decent places only <span className="afford-hint">(livability ≥ 60)</span>
        </label>
      </div>

      {/* Budget readout + legend */}
      <div className="afford-bar">
        <div className="afford-budget">
          Your housing budget: <strong>{formatCurrencyFull(Math.round(maxMonthlyBudget))}/mo</strong>
          {mode === 'buy' && <span className="afford-hint"> · ~{formatCurrencyFull(Math.round(maxMonthlyBudget * 12))}/yr incl. est. taxes &amp; insurance</span>}
        </div>
        <div className="map-legend">
          <span>Over budget</span>
          <div className="map-legend-bar" />
          <span>Comfortable</span>
        </div>
      </div>

      {/* Map + summary */}
      <div className="afford-layout">
        {loading ? (
          <div className="urbindex-map map-skeleton"><Loader2 size={28} className="analytics-spinner" /><span>Loading every US city…</span></div>
        ) : (
          <MetricMapCanvas points={points} metricLabel="Monthly housing" />
        )}

        <div className="afford-summary">
          {income <= 0 ? (
            <div className="discover-prompt"><Wallet size={24} style={{ color: 'var(--color-accent)' }} /><p>Enter your income to see where you can afford to live.</p></div>
          ) : (
            <>
              <div className="afford-headline">
                <div className="afford-headline-num">{qualifyingCount.toLocaleString()}</div>
                <div className="afford-headline-label">
                  of {totalCount.toLocaleString()} cities fit your budget
                  <span> — {mode === 'rent' ? 'renting' : 'buying'} at ≤{housingPct}% of income</span>
                </div>
              </div>
              <div className="afford-list-head">Best places you can afford</div>
              <div className="afford-list">
                {bestAffordable.map((s, idx) => (
                  <Link key={s.row.fips_code} href={getCityUrl(s.row.state_code, s.row.slug)} className="afford-row">
                    <span className="afford-rank">{idx + 1}</span>
                    <span className="afford-row-main">
                      <span className="afford-row-name">{s.row.name}, {s.row.state_code}</span>
                      <span className="afford-row-sub">{formatCurrencyFull(Math.round(s.monthly))}/mo · {Math.round(s.burden * 100)}% of income</span>
                    </span>
                    {s.livability !== null && (
                      <span className="afford-liv" title="Overall livability">{Math.round(s.livability)}</span>
                    )}
                  </Link>
                ))}
                {bestAffordable.length === 0 && (
                  <div className="discover-prompt"><p>No cities fit these rules. Try raising your housing % or income, or switching to renting.</p></div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="col-disclaimer" style={{ marginTop: 'var(--space-md)' }}>
        Estimate. Rent uses local median rent; buying estimates principal &amp; interest from local median home value plus ~{(PROPERTY_TAX_INS_RATE * 100).toFixed(2)}%/yr for property tax &amp; insurance. The {housingPct}% rule is applied to gross income. Not financial advice.
      </p>
    </div>
  );
}
