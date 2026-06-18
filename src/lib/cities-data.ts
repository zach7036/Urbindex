// ============================================================
// Urbindex — Shared city dataset loader + stat helpers
// Powers Match, Cost of Living, Similarity, Map, and Discover.
// ============================================================
import { supabase } from '@/lib/supabase';

// A single city flattened to one row holding every numeric metric.
export interface CityRow {
  fips_code: string;
  name: string;
  state_code: string;
  slug: string;
  population: number;
  city_class: string;
  latitude: number;
  longitude: number;
  [key: string]: string | number | null | undefined;
}

// Columns pulled from each related table. Kept in sync with the metric
// registry in metrics.ts — anything here becomes available to every tool.
const SELECT_QUERY = `
  fips_code, name, state_code, slug, population, city_class, latitude, longitude,
  city_demographics(total_population, population_density, median_age, male_pct, female_pct, foreign_born_pct, median_household_size, population_growth_rate, veterans_pct, disability_pct),
  city_economy(median_household_income, per_capita_income, mean_household_income, unemployment_rate, poverty_rate, labor_force_participation, gini_coefficient, job_growth_rate),
  city_housing(median_home_value, median_rent, homeownership_rate, vacancy_rate, housing_units, median_rooms, median_year_built, price_to_income_ratio, rent_to_income_ratio, housing_cost_burden_pct, yoy_appreciation),
  city_climate(avg_high_jan, avg_low_jan, avg_high_apr, avg_low_apr, avg_high_jul, avg_low_jul, avg_high_oct, avg_low_oct, annual_precipitation, annual_snowfall, sunny_days, rainy_days, days_above_90, days_below_32, avg_humidity, uv_index, comfort_index),
  city_safety(violent_crime_rate, property_crime_rate, total_crime_rate, safety_score),
  city_education(high_school_grad_pct, bachelors_pct, graduate_pct, student_teacher_ratio, school_expenditure_per_pupil),
  city_livability(walkscore, transit_score, bike_score, broadband_pct, commute_time_avg, aqi_avg, parks_per_capita, hospitals_per_capita, grocery_stores_per_capita),
  city_computed_scores(overall_livability, affordability_index, hidden_gem_score, cultural_density_index, economic_resilience)
`;

const RELATED_TABLES = [
  'city_demographics', 'city_economy', 'city_housing',
  'city_climate', 'city_safety', 'city_education',
  'city_livability', 'city_computed_scores',
] as const;

const SKIP_KEYS = new Set(['fips_code', 'id', 'year', 'is_imputed', 'created_at', 'updated_at']);

let _cache: CityRow[] | null = null;
let _inflight: Promise<CityRow[]> | null = null;

/**
 * Fetch every city with all metrics flattened into one row each.
 * Paginates past Supabase's 1000-row cap and memoizes the result so the
 * five tools that share this dataset only hit the network once per session.
 */
export async function fetchAllCityRows(): Promise<CityRow[]> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    const PAGE = 1000;
    let all: Record<string, unknown>[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('cities')
        .select(SELECT_QUERY)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all = all.concat(data as Record<string, unknown>[]);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const flat: CityRow[] = all.map((r) => {
      const row: CityRow = {
        fips_code: r.fips_code as string,
        name: r.name as string,
        state_code: r.state_code as string,
        slug: r.slug as string,
        population: r.population as number,
        city_class: r.city_class as string,
        latitude: r.latitude as number,
        longitude: r.longitude as number,
      };
      for (const tbl of RELATED_TABLES) {
        const raw = r[tbl];
        const nested = Array.isArray(raw) ? raw[0] : raw;
        if (nested && typeof nested === 'object') {
          for (const [k, v] of Object.entries(nested)) {
            if (!SKIP_KEYS.has(k)) row[k] = v as number;
          }
        }
      }
      return row;
    });

    _cache = flat;
    _inflight = null;
    return flat;
  })();

  return _inflight;
}

// ─── Numeric helpers ─────────────────────────────────────

function num(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/**
 * Build a 0–100 percentile lookup for one metric across the given rows.
 * Percentiles are robust to the heavy outliers in this data (e.g. a few
 * ultra-expensive coastal cities) in a way raw min–max normalization isn't.
 * `higherIsBetter=false` inverts so 100 always means "best".
 */
export function percentileScores(
  rows: CityRow[],
  key: string,
  higherIsBetter: boolean,
): Map<string, number> {
  const valued = rows
    .map((r) => ({ fips: r.fips_code, v: num(r[key]) }))
    .filter((x): x is { fips: string; v: number } => x.v !== null);

  valued.sort((a, b) => a.v - b.v);
  const n = valued.length;
  const out = new Map<string, number>();
  if (n === 0) return out;
  if (n === 1) {
    out.set(valued[0].fips, 100);
    return out;
  }

  // Average-rank percentile so ties share a score.
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && valued[j + 1].v === valued[i].v) j++;
    const avgRank = (i + j) / 2; // 0-based
    const pct = (avgRank / (n - 1)) * 100;
    const score = higherIsBetter ? pct : 100 - pct;
    for (let k = i; k <= j; k++) out.set(valued[k].fips, score);
    i = j + 1;
  }
  return out;
}

/** Mean and standard deviation of a metric, ignoring missing values. */
export function meanStd(rows: CityRow[], key: string): { mean: number; std: number } {
  const vals: number[] = [];
  for (const r of rows) {
    const v = num(r[key]);
    if (v !== null) vals.push(v);
  }
  if (vals.length === 0) return { mean: 0, std: 1 };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance) || 1; // avoid divide-by-zero on constant columns
  return { mean, std };
}

/** Great-circle distance between two lat/lng points, in miles. */
export function haversineMiles(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const getNum = num;
