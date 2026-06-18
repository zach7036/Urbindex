'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Loader2, Sparkles, DollarSign, Briefcase, Shield, Footprints,
  Sun, Wind, GraduationCap, Clock, Trees, TrendingUp, RotateCcw,
} from 'lucide-react';
import { fetchAllCityRows, percentileScores, getNum, CityRow } from '@/lib/cities-data';
import { getCityUrl, formatNumberFull, formatCurrency, STATE_NAMES } from '@/lib/utils';

// ─── Preference model ────────────────────────────────────
// Each dimension turns into a 0–100 per-city score by averaging the
// percentile of its component metrics (direction-aware). The user assigns
// each an importance weight; the final match is the weighted average.
interface Dimension {
  id: string;
  label: string;
  icon: React.ElementType;
  metrics: { key: string; higherIsBetter: boolean }[];
}

const DIMENSIONS: Dimension[] = [
  { id: 'affordable', label: 'Affordable housing', icon: DollarSign, metrics: [{ key: 'price_to_income_ratio', higherIsBetter: false }, { key: 'rent_to_income_ratio', higherIsBetter: false }] },
  { id: 'jobs', label: 'Strong job market', icon: Briefcase, metrics: [{ key: 'economic_resilience', higherIsBetter: true }, { key: 'unemployment_rate', higherIsBetter: false }] },
  { id: 'income', label: 'High incomes', icon: TrendingUp, metrics: [{ key: 'median_household_income', higherIsBetter: true }] },
  { id: 'safety', label: 'Low crime', icon: Shield, metrics: [{ key: 'safety_score', higherIsBetter: true }] },
  { id: 'walkable', label: 'Walkable & transit', icon: Footprints, metrics: [{ key: 'walkscore', higherIsBetter: true }, { key: 'transit_score', higherIsBetter: true }] },
  { id: 'air', label: 'Clean air', icon: Wind, metrics: [{ key: 'aqi_avg', higherIsBetter: false }] },
  { id: 'educated', label: 'Educated population', icon: GraduationCap, metrics: [{ key: 'bachelors_pct', higherIsBetter: true }] },
  { id: 'commute', label: 'Short commutes', icon: Clock, metrics: [{ key: 'commute_time_avg', higherIsBetter: false }] },
  { id: 'outdoors', label: 'Parks & green space', icon: Trees, metrics: [{ key: 'parks_per_capita', higherIsBetter: true }] },
];

// Climate is special: one importance weight, plus what "good weather" means.
type ClimatePref = 'warm' | 'mild' | 'seasons' | 'cool';
const CLIMATE_OPTIONS: { id: ClimatePref; label: string }[] = [
  { id: 'warm', label: 'Warm' },
  { id: 'mild', label: 'Mild & pleasant' },
  { id: 'seasons', label: 'Four seasons' },
  { id: 'cool', label: 'Cool' },
];

const WEIGHT_LABELS = ['Skip', 'Nice', 'Important', 'Must-have'];

// Quick-start presets — set every weight at once.
const PRESETS: Record<string, { weights: Record<string, number>; climate: number; climatePref: ClimatePref }> = {
  'Remote worker': { weights: { affordable: 3, jobs: 0, income: 1, safety: 2, walkable: 2, air: 2, educated: 1, commute: 0, outdoors: 2 }, climate: 2, climatePref: 'warm' },
  'Young family': { weights: { affordable: 3, jobs: 2, income: 1, safety: 3, walkable: 1, air: 2, educated: 2, commute: 2, outdoors: 2 }, climate: 1, climatePref: 'mild' },
  'Career growth': { weights: { affordable: 1, jobs: 3, income: 3, safety: 1, walkable: 2, air: 1, educated: 2, commute: 1, outdoors: 1 }, climate: 0, climatePref: 'mild' },
  'Retiree': { weights: { affordable: 3, jobs: 0, income: 0, safety: 3, walkable: 2, air: 3, educated: 0, commute: 0, outdoors: 2 }, climate: 3, climatePref: 'warm' },
  'Budget-first': { weights: { affordable: 3, jobs: 1, income: 1, safety: 2, walkable: 0, air: 1, educated: 0, commute: 1, outdoors: 1 }, climate: 1, climatePref: 'mild' },
};

const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(DIMENSIONS.map(d => [d.id, 1]));

const TIERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Any size' },
  { id: 'large', label: 'Large (250K+)' },
  { id: 'mid', label: 'Mid (100–250K)' },
  { id: 'small', label: 'Small (50–100K)' },
  { id: 'micro', label: 'Micro (10–50K)' },
];

interface ScoredCity {
  row: CityRow;
  score: number;
  strengths: { label: string; score: number }[];
}

export default function MatchEngine() {
  const [rows, setRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS);
  const [climateWeight, setClimateWeight] = useState(1);
  const [climatePref, setClimatePref] = useState<ClimatePref>('mild');

  const [stateFilter, setStateFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [maxRent, setMaxRent] = useState<number | ''>('');

  useEffect(() => {
    fetchAllCityRows()
      .then((data) => {
        // Derive climate columns once: warmth anchors winter lows + summer highs;
        // seasonality is the summer-to-winter swing (proxy for "four seasons").
        for (const r of data) {
          const jul = getNum(r.avg_high_jul);
          const jan = getNum(r.avg_low_jan);
          r._warmth = jul !== null && jan !== null ? (jul + jan) / 2 : null;
          r._seasonality = jul !== null && jan !== null ? jul - jan : null;
        }
        setRows(data);
      })
      .catch((e) => setError(e.message || 'Failed to load city data'))
      .finally(() => setLoading(false));
  }, []);

  // Hard filters define the universe scores are computed relative to.
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (stateFilter !== 'all' && r.state_code !== stateFilter) return false;
      if (tierFilter !== 'all' && r.city_class !== tierFilter) return false;
      if (maxRent !== '' && typeof r.median_rent === 'number' && r.median_rent > maxRent) return false;
      return true;
    });
  }, [rows, stateFilter, tierFilter, maxRent]);

  // Percentile lookups per metric, computed over the filtered universe.
  const percentiles = useMemo(() => {
    const maps: Record<string, Map<string, number>> = {};
    for (const d of DIMENSIONS) {
      for (const m of d.metrics) {
        if (!maps[m.key]) maps[m.key] = percentileScores(filtered, m.key, m.higherIsBetter);
      }
    }
    // Climate derived metrics, direction depends on the user's preference.
    maps['_warmth_high'] = percentileScores(filtered, '_warmth', true);
    maps['_warmth_low'] = percentileScores(filtered, '_warmth', false);
    maps['_seasonality'] = percentileScores(filtered, '_seasonality', true);
    maps['comfort_index'] = percentileScores(filtered, 'comfort_index', true);
    return maps;
  }, [filtered]);

  const totalWeight = useMemo(
    () => Object.values(weights).reduce((a, b) => a + b, 0) + climateWeight,
    [weights, climateWeight],
  );

  const results = useMemo<ScoredCity[]>(() => {
    if (totalWeight === 0) return [];

    const climateMapKey =
      climatePref === 'warm' ? '_warmth_high'
      : climatePref === 'cool' ? '_warmth_low'
      : climatePref === 'seasons' ? '_seasonality'
      : 'comfort_index';

    const scored: ScoredCity[] = [];
    for (const r of filtered) {
      const fips = r.fips_code;
      let weightedSum = 0;
      let weightUsed = 0;
      const contribs: { label: string; score: number; weight: number }[] = [];

      for (const d of DIMENSIONS) {
        const w = weights[d.id] || 0;
        if (w === 0) continue;
        // Average the available component percentiles for this dimension.
        let sum = 0, count = 0;
        for (const m of d.metrics) {
          const s = percentiles[m.key]?.get(fips);
          if (s !== undefined) { sum += s; count++; }
        }
        if (count === 0) continue; // city missing this dimension — don't penalize
        const dimScore = sum / count;
        weightedSum += dimScore * w;
        weightUsed += w;
        contribs.push({ label: d.label, score: dimScore, weight: w });
      }

      if (climateWeight > 0) {
        const s = percentiles[climateMapKey]?.get(fips);
        if (s !== undefined) {
          weightedSum += s * climateWeight;
          weightUsed += climateWeight;
          contribs.push({ label: 'Climate', score: s, weight: climateWeight });
        }
      }

      if (weightUsed === 0) continue;
      const score = weightedSum / weightUsed;
      // Top strengths = the weighted dimensions where this city scores highest.
      const strengths = contribs
        .filter(c => c.score >= 60)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(c => ({ label: c.label, score: c.score }));

      scored.push({ row: r, score, strengths });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 60);
  }, [filtered, percentiles, weights, climateWeight, climatePref, totalWeight]);

  const states = useMemo(
    () => [...new Set(rows.map(r => r.state_code))].sort(),
    [rows],
  );

  function applyPreset(name: string) {
    const p = PRESETS[name];
    setWeights({ ...p.weights });
    setClimateWeight(p.climate);
    setClimatePref(p.climatePref);
  }

  function reset() {
    setWeights({ ...DEFAULT_WEIGHTS });
    setClimateWeight(1);
    setClimatePref('mild');
    setStateFilter('all');
    setTierFilter('all');
    setMaxRent('');
  }

  if (loading) {
    return (
      <div className="analytics-loading">
        <Loader2 size={32} className="analytics-spinner" />
        <p>Loading every US city…</p>
      </div>
    );
  }
  if (error) {
    return <div className="analytics-loading"><p style={{ color: 'var(--color-danger)' }}>Error: {error}</p></div>;
  }

  return (
    <div className="match-layout">
      {/* ── Controls ─────────────────────────────── */}
      <aside className="match-panel">
        <div className="match-presets">
          <span className="match-presets-label"><Sparkles size={13} /> Quick start</span>
          <div className="match-preset-chips">
            {Object.keys(PRESETS).map(name => (
              <button key={name} className="match-preset-chip" onClick={() => applyPreset(name)}>{name}</button>
            ))}
          </div>
        </div>

        <div className="match-section-title">What matters to you?</div>

        {DIMENSIONS.map(d => {
          const Icon = d.icon;
          const w = weights[d.id] ?? 0;
          return (
            <div key={d.id} className="match-pref-row">
              <div className="match-pref-label"><Icon size={15} /> {d.label}</div>
              <div className="match-weight-seg">
                {WEIGHT_LABELS.map((lbl, i) => (
                  <button
                    key={i}
                    className={`match-weight-btn ${w === i ? 'active' : ''}`}
                    onClick={() => setWeights(prev => ({ ...prev, [d.id]: i }))}
                    title={lbl}
                  >{lbl}</button>
                ))}
              </div>
            </div>
          );
        })}

        {/* Climate: weight + meaning */}
        <div className="match-pref-row">
          <div className="match-pref-label"><Sun size={15} /> Climate</div>
          <div className="match-weight-seg">
            {WEIGHT_LABELS.map((lbl, i) => (
              <button
                key={i}
                className={`match-weight-btn ${climateWeight === i ? 'active' : ''}`}
                onClick={() => setClimateWeight(i)}
                title={lbl}
              >{lbl}</button>
            ))}
          </div>
        </div>
        {climateWeight > 0 && (
          <div className="match-climate-opts">
            {CLIMATE_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`match-climate-chip ${climatePref === o.id ? 'active' : ''}`}
                onClick={() => setClimatePref(o.id)}
              >{o.label}</button>
            ))}
          </div>
        )}

        <div className="match-section-title">Narrow it down</div>
        <div className="match-filters">
          <label className="match-filter">
            <span>State</span>
            <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
              <option value="all">All states</option>
              {states.map(s => <option key={s} value={s}>{STATE_NAMES[s] || s}</option>)}
            </select>
          </label>
          <label className="match-filter">
            <span>City size</span>
            <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
              {TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="match-filter">
            <span>Max rent / mo</span>
            <input
              type="number" min={0} step={50} placeholder="No limit"
              value={maxRent}
              onChange={e => setMaxRent(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
        </div>

        <button className="match-reset" onClick={reset}><RotateCcw size={13} /> Reset all</button>
      </aside>

      {/* ── Results ──────────────────────────────── */}
      <div className="match-results">
        {totalWeight === 0 ? (
          <div className="match-empty">
            <Sparkles size={28} style={{ color: 'var(--color-accent)' }} />
            <p>Pick at least one priority to see your matches.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="match-empty"><p>No cities match those filters. Try loosening them.</p></div>
        ) : (
          <>
            <div className="match-results-head">
              <span>Your top matches</span>
              <span className="match-results-count">{filtered.length.toLocaleString()} cities scored</span>
            </div>
            <div className="match-grid">
              {results.map((c, idx) => (
                <Link key={c.row.fips_code} href={getCityUrl(c.row.state_code, c.row.slug)} className="match-card">
                  <div className="match-card-rank">#{idx + 1}</div>
                  <div className="match-score-ring" style={{ '--pct': `${c.score}%` } as React.CSSProperties}>
                    <span>{Math.round(c.score)}</span>
                  </div>
                  <div className="match-card-body">
                    <div className="match-card-name">{c.row.name}<span className="match-card-state">{c.row.state_code}</span></div>
                    <div className="match-card-sub">
                      {formatNumberFull(c.row.population)} people
                      {typeof c.row.median_rent === 'number' && ` · ${formatCurrency(c.row.median_rent)}/mo rent`}
                    </div>
                    <div className="match-strengths">
                      {c.strengths.length > 0
                        ? c.strengths.map(s => <span key={s.label} className="match-strength-tag">{s.label}</span>)
                        : <span className="match-strength-tag muted">Balanced fit</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
