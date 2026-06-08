'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Users, DollarSign, Home, Sun, Shield, GraduationCap,
  TreePine, Star, ArrowDown, ArrowUp,
  Search, Filter, X, ChevronDown, Loader2, BarChart3,
} from 'lucide-react';
import { fuzzyMatchCity } from '@/lib/search-utils';
import { supabase } from '@/lib/supabase';
import { getCityUrl } from '@/lib/utils';
import {
  CATEGORIES, METRICS, MetricCategory, MetricDef,
  getMetricsByCategory, formatMetricValue,
} from '@/lib/metrics';

// Icon map for categories
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Users, DollarSign, Home, Sun, Shield, GraduationCap, TreePine, Star,
};

// Flattened city row with all numeric metrics
interface CityRow {
  fips_code: string;
  name: string;
  state_code: string;
  slug: string;
  population: number;
  city_class: string;
  [key: string]: any;
}

const PAGE_SIZE = 50; // Rows rendered at a time for virtual scroll

export default function AnalyticsExplorer() {
  // ─── State ────────────────────────────────────────
  const [data, setData] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<MetricCategory>('demographics');
  const [activeMetric, setActiveMetric] = useState<MetricDef>(
    METRICS.find(m => m.key === 'population')!
  );
  const [sortAsc, setSortAsc] = useState(false); // default = highest first
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [tierDropdownOpen, setTierDropdownOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const tierDropdownRef = useRef<HTMLDivElement>(null);

  // ─── Eager Load All Data ────────────────────────────
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const selectQuery = `
            fips_code, name, state_code, slug, population, city_class,
            city_demographics(total_population, population_density, median_age, male_pct, female_pct, foreign_born_pct, median_household_size, population_growth_rate, veterans_pct, disability_pct),
            city_economy(median_household_income, per_capita_income, mean_household_income, unemployment_rate, poverty_rate, labor_force_participation, gini_coefficient, job_growth_rate),
            city_housing(median_home_value, median_rent, homeownership_rate, vacancy_rate, housing_units, median_rooms, median_year_built, price_to_income_ratio, rent_to_income_ratio, housing_cost_burden_pct, yoy_appreciation),
            city_climate(avg_high_jan, avg_low_jan, avg_high_apr, avg_low_apr, avg_high_jul, avg_low_jul, avg_high_oct, avg_low_oct, annual_precipitation, annual_snowfall, sunny_days, rainy_days, days_above_90, days_below_32, avg_humidity, uv_index, comfort_index),
            city_safety(violent_crime_rate, property_crime_rate, total_crime_rate, safety_score),
            city_education(high_school_grad_pct, bachelors_pct, graduate_pct, student_teacher_ratio, school_expenditure_per_pupil),
            city_livability(walkscore, transit_score, bike_score, broadband_pct, commute_time_avg, aqi_avg, parks_per_capita, hospitals_per_capita, grocery_stores_per_capita),
            city_computed_scores(overall_livability, affordability_index, hidden_gem_score, cultural_density_index, economic_resilience)
          `;

        // Supabase default limit is 1000 — paginate to get all cities
        const PAGE = 1000;
        let allRows: any[] = [];
        let from = 0;
        while (true) {
          const { data: batch, error: err } = await supabase
            .from('cities')
            .select(selectQuery)
            .range(from, from + PAGE - 1);
          if (err) throw err;
          if (!batch || batch.length === 0) break;
          allRows = allRows.concat(batch);
          if (batch.length < PAGE) break; // last page
          from += PAGE;
        }

        const rows = allRows;

        if (!rows || rows.length === 0) throw new Error('No data returned');

        // Flatten nested objects into a single row per city
        const flat: CityRow[] = rows.map((r: any) => {
          const city: CityRow = {
            fips_code: r.fips_code,
            name: r.name,
            state_code: r.state_code,
            slug: r.slug,
            population: r.population,
            city_class: r.city_class,
          };
          // Flatten each related table (may be array or object)
          const tables = [
            'city_demographics', 'city_economy', 'city_housing',
            'city_climate', 'city_safety', 'city_education',
            'city_livability', 'city_computed_scores',
          ];
          for (const tbl of tables) {
            const nested = Array.isArray(r[tbl]) ? r[tbl][0] : r[tbl];
            if (nested) {
              for (const [k, v] of Object.entries(nested)) {
                if (k !== 'fips_code' && k !== 'id' && k !== 'year' && k !== 'is_imputed' && k !== 'created_at' && k !== 'updated_at') {
                  city[k] = v;
                }
              }
            }
          }
          return city;
        });

        setData(flat);
      } catch (e: any) {
        setError(e.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // ─── Close dropdowns on outside click ─────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(e.target as Node)) {
        setStateDropdownOpen(false);
      }
      if (tierDropdownRef.current && !tierDropdownRef.current.contains(e.target as Node)) {
        setTierDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ─── Derived: unique states ────────────────────────
  const states = useMemo(() => {
    const s = [...new Set(data.map(c => c.state_code))].sort();
    return s;
  }, [data]);

  // ─── Derived: filtered + sorted list ──────────────
  const sortedCities = useMemo(() => {
    let list = [...data];

    // State filter
    if (stateFilter !== 'all') {
      list = list.filter(c => c.state_code === stateFilter);
    }

    // Tier filter
    if (tierFilter !== 'all') {
      list = list.filter(c => c.city_class === tierFilter);
    }

    // Search within results
    if (searchQuery.trim()) {
      list = list.filter(c => fuzzyMatchCity(c.name, searchQuery));
    }

    // Sort. Cities missing data for the active metric always sink to the
    // bottom — regardless of direction — so "Lowest First" doesn't surface a
    // wall of blank ("—") rows ahead of real data.
    const key = activeMetric.key;
    list.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const aMissing = av == null || (typeof av === 'number' && !isFinite(av));
      const bMissing = bv == null || (typeof bv === 'number' && !isFinite(bv));
      if (aMissing || bMissing) {
        if (aMissing && bMissing) return 0;
        return aMissing ? 1 : -1;
      }
      return sortAsc ? av - bv : bv - av;
    });

    return list;
  }, [data, stateFilter, tierFilter, searchQuery, activeMetric, sortAsc]);

  // ─── Stats for the mini-bar ───────────────────────
  const { maxVal, minVal } = useMemo(() => {
    const key = activeMetric.key;
    let max = -Infinity, min = Infinity;
    for (const c of sortedCities) {
      const v = c[key];
      if (v != null && isFinite(v)) {
        if (v > max) max = v;
        if (v < min) min = v;
      }
    }
    return { maxVal: max === -Infinity ? 0 : max, minVal: min === Infinity ? 0 : min };
  }, [sortedCities, activeMetric]);

  // ─── Infinite scroll ──────────────────────────────
  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 200) {
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, sortedCities.length));
    }
  }, [sortedCities.length]);

  // Reset visible count when filters/metric change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [activeMetric, stateFilter, tierFilter, searchQuery, sortAsc]);

  // ─── Category/Metric Selection ────────────────────
  function selectCategory(cat: MetricCategory) {
    setActiveCategory(cat);
    const first = getMetricsByCategory(cat)[0];
    if (first) {
      setActiveMetric(first);
      setSortAsc(!first.higherIsBetter); // Smart default: best first
    }
  }

  function selectMetric(m: MetricDef) {
    setActiveMetric(m);
    setSortAsc(!m.higherIsBetter); // Smart default
  }

  // ─── Render Helpers ───────────────────────────────
  const categoryMetrics = getMetricsByCategory(activeCategory);

  const barPercent = useCallback((value: number | null | undefined) => {
    if (value == null || !isFinite(value) || maxVal === minVal) return 0;
    return Math.max(0, Math.min(100, ((value - minVal) / (maxVal - minVal)) * 100));
  }, [maxVal, minVal]);

  const getCategoryColor = (cat: MetricCategory) =>
    CATEGORIES.find(c => c.key === cat)?.color || '#06d6a0';

  const tierLabels: Record<string, string> = {
    'all': 'All Sizes',
    'large': 'Large (250K+)',
    'mid': 'Mid (100K–250K)',
    'small': 'Small (50K–100K)',
    'micro': 'Micro (10K–50K)',
  };

  const accentColor = getCategoryColor(activeCategory);

  // ─── Render ───────────────────────────────────────
  if (loading) {
    return (
      <div className="analytics-loading">
        <Loader2 size={32} className="analytics-spinner" />
        <p>Loading 4,000+ cities across 60+ data points...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-loading">
        <p style={{ color: 'var(--color-danger)' }}>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      {/* ── Category Chips ──────────────────────────── */}
      <div className="analytics-categories">
        {CATEGORIES.map(cat => {
          const Icon = CATEGORY_ICONS[cat.icon] || BarChart3;
          return (
            <button
              key={cat.key}
              className={`analytics-category-chip ${activeCategory === cat.key ? 'active' : ''}`}
              onClick={() => selectCategory(cat.key)}
              style={{
                '--chip-color': cat.color,
              } as React.CSSProperties}
            >
              <Icon size={15} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* ── Metric Selector ────────────────────────── */}
      <div className="analytics-metrics-bar">
        {categoryMetrics.map(m => (
          <button
            key={m.key}
            className={`analytics-metric-btn ${activeMetric.key === m.key ? 'active' : ''}`}
            onClick={() => selectMetric(m)}
            style={{
              '--metric-color': accentColor,
            } as React.CSSProperties}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Controls Bar ───────────────────────────── */}
      <div className="analytics-controls">
        <div className="analytics-controls-left">
          {/* Sort toggle */}
          <button
            className="analytics-sort-btn"
            onClick={() => setSortAsc(!sortAsc)}
            title={sortAsc ? 'Lowest → Highest' : 'Highest → Lowest'}
          >
            {sortAsc ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {sortAsc ? 'Lowest First' : 'Highest First'}
          </button>

          {/* State filter */}
          <div className="analytics-dropdown" ref={stateDropdownRef}>
            <button
              className="analytics-filter-btn"
              onClick={() => { setStateDropdownOpen(!stateDropdownOpen); setTierDropdownOpen(false); }}
            >
              <Filter size={13} />
              {stateFilter === 'all' ? 'All States' : stateFilter}
              <ChevronDown size={13} />
            </button>
            {stateDropdownOpen && (
              <div className="analytics-dropdown-menu">
                <button
                  className={stateFilter === 'all' ? 'active' : ''}
                  onClick={() => { setStateFilter('all'); setStateDropdownOpen(false); }}
                >
                  All States
                </button>
                {states.map(s => (
                  <button
                    key={s}
                    className={stateFilter === s ? 'active' : ''}
                    onClick={() => { setStateFilter(s); setStateDropdownOpen(false); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tier filter */}
          <div className="analytics-dropdown" ref={tierDropdownRef}>
            <button
              className="analytics-filter-btn"
              onClick={() => { setTierDropdownOpen(!tierDropdownOpen); setStateDropdownOpen(false); }}
            >
              <Users size={13} />
              {tierLabels[tierFilter]}
              <ChevronDown size={13} />
            </button>
            {tierDropdownOpen && (
              <div className="analytics-dropdown-menu">
                {Object.entries(tierLabels).map(([k, label]) => (
                  <button
                    key={k}
                    className={tierFilter === k ? 'active' : ''}
                    onClick={() => { setTierFilter(k); setTierDropdownOpen(false); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search in results */}
        <div className="analytics-search-wrapper">
          <Search size={14} className="analytics-search-icon" />
          <input
            type="text"
            className="analytics-search-input"
            placeholder="Find a city..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="analytics-search-clear" onClick={() => setSearchQuery('')}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Active Metric Header ─────────────────────── */}
      <div className="analytics-active-header">
        <div>
          <h2 className="analytics-active-title" style={{ color: accentColor }}>
            {activeMetric.label}
          </h2>
          {activeMetric.description && (
            <p className="analytics-active-desc">{activeMetric.description}</p>
          )}
        </div>
        <div className="analytics-result-count">
          {sortedCities.length.toLocaleString()} cities
        </div>
      </div>

      {/* ── Ranked List ──────────────────────────────── */}
      <div className="analytics-list" ref={listRef} onScroll={handleScroll}>
        {/* Column headers */}
        <div className="analytics-row analytics-row-header">
          <span className="analytics-col-rank">#</span>
          <span className="analytics-col-city">City</span>
          <span className="analytics-col-bar">Distribution</span>
          <span className="analytics-col-value">{activeMetric.label}</span>
        </div>

        {sortedCities.slice(0, visibleCount).map((city, idx) => {
          const value = city[activeMetric.key];
          const pct = barPercent(value);
          const isAboveAvg = activeMetric.nationalAvg != null && value != null &&
            (activeMetric.higherIsBetter ? value >= activeMetric.nationalAvg : value <= activeMetric.nationalAvg);

          return (
            <Link
              key={city.fips_code}
              href={getCityUrl(city.state_code, city.slug)}
              className="analytics-row"
            >
              <span className="analytics-col-rank">
                {idx + 1}
              </span>
              <span className="analytics-col-city">
                <span className="analytics-city-name">{city.name}</span>
                <span className="analytics-city-state">{city.state_code}</span>
                <span className={`analytics-city-tier analytics-tier-${city.city_class}`}>
                  {city.city_class}
                </span>
              </span>
              <span className="analytics-col-bar">
                <span className="analytics-minibar-track">
                  <span
                    className="analytics-minibar-fill"
                    style={{
                      width: `${pct}%`,
                      background: accentColor,
                    }}
                  />
                  {activeMetric.nationalAvg != null && maxVal !== minVal && (
                    <span
                      className="analytics-minibar-avg"
                      style={{
                        left: `${Math.max(0, Math.min(100, ((activeMetric.nationalAvg - minVal) / (maxVal - minVal)) * 100))}%`,
                      }}
                      title={`National avg: ${formatMetricValue(activeMetric.nationalAvg, activeMetric.format)}`}
                    />
                  )}
                </span>
              </span>
              <span className="analytics-col-value" style={{
                color: value == null ? 'var(--color-text-tertiary)' :
                  activeMetric.nationalAvg != null ? (isAboveAvg ? 'var(--color-success)' : 'var(--color-danger)') :
                  'var(--color-text-primary)',
              }}>
                {formatMetricValue(value, activeMetric.format)}
              </span>
            </Link>
          );
        })}

        {visibleCount < sortedCities.length && (
          <div className="analytics-load-more">
            <Loader2 size={16} className="analytics-spinner" />
            Scroll for more...
          </div>
        )}

        {sortedCities.length === 0 && (
          <div className="analytics-empty">
            No cities match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
