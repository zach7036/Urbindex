'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Loader2, Dna, X } from 'lucide-react';
import CityPicker from '@/components/compare/CityPicker';
import { fetchAllCityRows, percentileScores, getNum, CityRow } from '@/lib/cities-data';
import { getCityUrl, formatNumberFull, formatCurrency } from '@/lib/utils';

interface CityResult {
  fips_code: string;
  name: string;
  state: string;
  state_code: string;
  population: number;
  slug: string;
}

// Metrics that define a city's "character". Direction is irrelevant for a
// distance comparison, so we just need a normalized position per metric.
const SIM_METRICS = [
  'population', 'population_density', 'median_age', 'median_household_income',
  'bachelors_pct', 'walkscore', 'safety_score', 'median_home_value',
  'comfort_index', '_warmth', 'unemployment_rate', 'foreign_born_pct',
  'commute_time_avg', 'parks_per_capita',
];

type FilterKey = 'cheaper' | 'pricier' | 'bigger' | 'smaller' | 'warmer' | 'cooler' | 'safer' | 'diffState';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'cheaper', label: 'Cheaper' },
  { key: 'pricier', label: 'Pricier' },
  { key: 'bigger', label: 'Bigger' },
  { key: 'smaller', label: 'Smaller' },
  { key: 'warmer', label: 'Warmer' },
  { key: 'cooler', label: 'Cooler' },
  { key: 'safer', label: 'Safer' },
  { key: 'diffState', label: 'Different state' },
];

export default function SimilarClient({ initialFips }: { initialFips: string | null }) {
  const [rows, setRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<CityResult | null>(null);
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());

  useEffect(() => {
    fetchAllCityRows()
      .then((data) => {
        for (const r of data) {
          const jul = getNum(r.avg_high_jul);
          const jan = getNum(r.avg_low_jan);
          r._warmth = jul !== null && jan !== null ? (jul + jan) / 2 : null;
        }
        setRows(data);
      })
      .catch((e) => setError(e.message || 'Failed to load city data'))
      .finally(() => setLoading(false));
  }, []);

  // Resolve a deep-linked ?city=<fips> into the picker once data is present.
  useEffect(() => {
    if (initialFips && rows.length && !source) {
      const r = rows.find(x => x.fips_code === initialFips);
      if (r) {
        setSource({
          fips_code: r.fips_code, name: r.name, state: r.state_code,
          state_code: r.state_code, population: r.population, slug: r.slug,
        });
      }
    }
  }, [initialFips, rows, source]);

  // Normalized [0,1] position per metric, across all cities.
  const vectors = useMemo(() => {
    const maps: Record<string, Map<string, number>> = {};
    for (const k of SIM_METRICS) maps[k] = percentileScores(rows, k, true);
    return maps;
  }, [rows]);

  const sourceRow = useMemo(
    () => (source ? rows.find(r => r.fips_code === source.fips_code) ?? null : null),
    [source, rows],
  );

  const results = useMemo(() => {
    if (!sourceRow) return [];
    const srcVec = SIM_METRICS.map(k => (vectors[k]?.get(sourceRow.fips_code) ?? 50) / 100);
    const maxDist = Math.sqrt(SIM_METRICS.length);

    const srcHome = getNum(sourceRow.median_home_value);
    const srcPop = getNum(sourceRow.population);
    const srcWarm = getNum(sourceRow._warmth);
    const srcSafe = getNum(sourceRow.safety_score);

    const scored = [];
    for (const r of rows) {
      if (r.fips_code === sourceRow.fips_code) continue;

      // "Like X but…" filters
      if (filters.has('diffState') && r.state_code === sourceRow.state_code) continue;
      if (filters.has('cheaper')) { const v = getNum(r.median_home_value); if (srcHome === null || v === null || v >= srcHome) continue; }
      if (filters.has('pricier')) { const v = getNum(r.median_home_value); if (srcHome === null || v === null || v <= srcHome) continue; }
      if (filters.has('bigger')) { const v = getNum(r.population); if (srcPop === null || v === null || v <= srcPop) continue; }
      if (filters.has('smaller')) { const v = getNum(r.population); if (srcPop === null || v === null || v >= srcPop) continue; }
      if (filters.has('warmer')) { const v = getNum(r._warmth); if (srcWarm === null || v === null || v <= srcWarm) continue; }
      if (filters.has('cooler')) { const v = getNum(r._warmth); if (srcWarm === null || v === null || v >= srcWarm) continue; }
      if (filters.has('safer')) { const v = getNum(r.safety_score); if (srcSafe === null || v === null || v <= srcSafe) continue; }

      let sumSq = 0;
      for (let i = 0; i < SIM_METRICS.length; i++) {
        const v = (vectors[SIM_METRICS[i]]?.get(r.fips_code) ?? 50) / 100;
        sumSq += (v - srcVec[i]) ** 2;
      }
      const dist = Math.sqrt(sumSq);
      const similarity = Math.max(0, 100 * (1 - dist / maxDist));
      scored.push({ row: r, similarity });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, 24);
  }, [sourceRow, rows, vectors, filters]);

  function toggleFilter(k: FilterKey) {
    setFilters(prev => {
      const next = new Set(prev);
      // cheaper/pricier, bigger/smaller, warmer/cooler are mutually exclusive pairs
      const exclusive: Record<string, string> = { cheaper: 'pricier', pricier: 'cheaper', bigger: 'smaller', smaller: 'bigger', warmer: 'cooler', cooler: 'warmer' };
      if (next.has(k)) next.delete(k);
      else { next.add(k); if (exclusive[k]) next.delete(exclusive[k] as FilterKey); }
      return next;
    });
  }

  if (loading) {
    return <div className="analytics-loading"><Loader2 size={32} className="analytics-spinner" /><p>Loading every US city…</p></div>;
  }
  if (error) {
    return <div className="analytics-loading"><p style={{ color: 'var(--color-danger)' }}>Error: {error}</p></div>;
  }

  return (
    <div>
      <div style={{ maxWidth: 520, margin: '0 auto var(--space-xl)' }}>
        <CityPicker selected={source} onSelect={setSource} onRemove={() => setSource(null)} placeholder="Pick a city you love…" autoFocus />
      </div>

      {sourceRow && (
        <>
          <div className="sim-filters">
            <span className="sim-filters-label"><Dna size={14} /> Like {sourceRow.name}, but…</span>
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`sim-filter-chip ${filters.has(f.key) ? 'active' : ''}`}
                onClick={() => toggleFilter(f.key)}
              >
                {f.label}
                {filters.has(f.key) && <X size={12} />}
              </button>
            ))}
          </div>

          {results.length === 0 ? (
            <div className="match-empty"><p>No cities match those constraints. Try removing a filter.</p></div>
          ) : (
            <div className="sim-grid">
              {results.map(({ row, similarity }) => (
                <Link key={row.fips_code} href={getCityUrl(row.state_code, row.slug)} className="sim-card">
                  <div className="sim-match">
                    <div className="sim-match-pct">{Math.round(similarity)}%</div>
                    <div className="sim-match-label">match</div>
                  </div>
                  <div className="sim-card-body">
                    <div className="sim-card-name">{row.name}<span className="sim-card-state">{row.state_code}</span></div>
                    <div className="sim-card-stats">
                      <span>{formatNumberFull(row.population)} ppl</span>
                      {typeof row.median_home_value === 'number' && <span>{formatCurrency(row.median_home_value)} home</span>}
                      {typeof row.safety_score === 'number' && <span>Safety {Math.round(row.safety_score)}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {!sourceRow && (
        <div className="match-empty">
          <Dna size={28} style={{ color: 'var(--color-accent)' }} />
          <p>Choose a city to discover its closest matches nationwide.</p>
        </div>
      )}
    </div>
  );
}
