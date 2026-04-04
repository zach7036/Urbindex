'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, ChevronDown, ChevronRight, Users, DollarSign, Home, Sun, Shield, GraduationCap, TreePine, Star, ExternalLink, Trophy, Zap } from 'lucide-react';
import { CityProfile } from '@/lib/types';
import { NATIONAL_AVERAGES } from '@/lib/constants';
import { formatNumber, getCityUrl, slugify, STATE_NAMES } from '@/lib/utils';
import { fetchCityComparison } from '@/app/compare/actions';
import CityPicker from './CityPicker';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip } from 'recharts';

interface CitySlot {
  fips_code: string;
  name: string;
  state: string;
  state_code: string;
  population: number;
  slug: string;
}

interface CompareRow {
  label: string;
  key: string;
  format: 'number' | 'currency' | 'percent' | 'temperature' | 'score' | 'days' | 'inches' | 'minutes' | 'ratio' | 'rate' | 'year';
  higherIsBetter: boolean;
  nationalAvg?: number;
  values: (number | null | undefined)[];
}

interface CompareSection {
  title: string;
  icon: React.ElementType;
  color: string;
  rows: CompareRow[];
}

const CITY_COLORS = ['#8b5cf6', '#06d6a0', '#f59e0b', '#3b82f6'];

// ── Quick-Compare Presets ──────────────────
const PRESETS = [
  { label: '🏙️ NYC vs LA vs Chicago', fips: ['3651000', '0644000', '1714000'] },
  { label: '💻 Tech Hubs', fips: ['0667000', '5363000', '4805000'] },
  { label: '🌴 Sun Belt', fips: ['1245000', '0427000', '4835000'] },
  { label: '🏡 Midwest Gems', fips: ['2918000', '3918000', '2743000'] },
  { label: '🎓 College Towns', fips: ['3755000', '2603000', '3712000'] },
];

function fmtVal(value: number | null | undefined, format: string): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  switch (format) {
    case 'currency':
      return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M`
        : value >= 1_000 ? `$${Math.round(value).toLocaleString()}`
          : `$${value}`;
    case 'percent': return `${value.toFixed(1)}%`;
    case 'temperature': return `${Math.round(value)}°F`;
    case 'score': return `${Math.round(value)}`;
    case 'days': return `${Math.round(value)}`;
    case 'inches': return `${value.toFixed(1)}"`;
    case 'minutes': return `${value.toFixed(1)} min`;
    case 'ratio': return value.toFixed(2);
    case 'rate': return value.toFixed(1);
    case 'year': return `${Math.round(value)}`;
    default:
      return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M`
        : value >= 10_000 ? `${(value / 1_000).toFixed(1)}K`
          : value % 1 === 0 ? value.toLocaleString() : value.toFixed(1);
  }
}

function getVal(profile: CityProfile, table: string, key: string): number | null {
  const section = (profile as any)[table];
  if (!section) return null;
  const v = section[key];
  return v === undefined || v === null ? null : Number(v);
}

function buildSections(profiles: CityProfile[]): CompareSection[] {
  const row = (label: string, table: string, key: string, format: CompareRow['format'], higherIsBetter: boolean, nationalAvg?: number): CompareRow => ({
    label, key, format, higherIsBetter, nationalAvg,
    values: profiles.map(p => getVal(p, table, key)),
  });

  return [
    {
      title: 'Urbindex Scores', icon: Star, color: '#f97316',
      rows: [
        row('Overall Livability', 'computed_scores', 'overall_livability', 'score', true),
        row('Affordability Index', 'computed_scores', 'affordability_index', 'score', true),
        row('City Pulse Score', 'computed_scores', 'cultural_density_index', 'score', true),
        row('Hidden Gem Score', 'computed_scores', 'hidden_gem_score', 'score', true),
        row('Economic Resilience', 'computed_scores', 'economic_resilience', 'score', true),
      ],
    },
    {
      title: 'Demographics', icon: Users, color: '#8b5cf6',
      rows: [
        row('Population', 'demographics', 'total_population', 'number', true),
        row('Pop. Density (per mi²)', 'demographics', 'population_density', 'number', true),
        row('Median Age', 'demographics', 'median_age', 'number', false, NATIONAL_AVERAGES.median_age),
        row('Growth Rate', 'demographics', 'population_growth_rate', 'percent', true, NATIONAL_AVERAGES.population_growth_rate),
        row('Foreign Born %', 'demographics', 'foreign_born_pct', 'percent', true),
        row('Disability %', 'demographics', 'disability_pct', 'percent', false),
        row('Avg Household Size', 'demographics', 'median_household_size', 'number', true),
      ],
    },
    {
      title: 'Economy', icon: DollarSign, color: '#06d6a0',
      rows: [
        row('Median Household Income', 'economy', 'median_household_income', 'currency', true, NATIONAL_AVERAGES.median_household_income),
        row('Per Capita Income', 'economy', 'per_capita_income', 'currency', true),
        row('Mean Household Income', 'economy', 'mean_household_income', 'currency', true),
        row('Unemployment Rate', 'economy', 'unemployment_rate', 'percent', false, NATIONAL_AVERAGES.unemployment_rate),
        row('Poverty Rate', 'economy', 'poverty_rate', 'percent', false, NATIONAL_AVERAGES.poverty_rate),
        row('Labor Force Participation', 'economy', 'labor_force_participation', 'percent', true),
        row('Gini Coefficient', 'economy', 'gini_coefficient', 'ratio', false),
      ],
    },
    {
      title: 'Housing', icon: Home, color: '#f59e0b',
      rows: [
        row('Median Home Value', 'housing', 'median_home_value', 'currency', false, NATIONAL_AVERAGES.median_home_value),
        row('Median Rent', 'housing', 'median_rent', 'currency', false, NATIONAL_AVERAGES.median_rent),
        row('Homeownership Rate', 'housing', 'homeownership_rate', 'percent', true, NATIONAL_AVERAGES.homeownership_rate),
        row('Vacancy Rate', 'housing', 'vacancy_rate', 'percent', false),
        row('Price-to-Income Ratio', 'housing', 'price_to_income_ratio', 'ratio', false),
        row('Rent-to-Income Ratio', 'housing', 'rent_to_income_ratio', 'percent', false),
        row('YoY Appreciation', 'housing', 'yoy_appreciation', 'percent', true),
        row('Median Year Built', 'housing', 'median_year_built', 'year', true),
      ],
    },
    {
      title: 'Climate', icon: Sun, color: '#3b82f6',
      rows: [
        row('Summer High (Jul)', 'climate', 'avg_high_jul', 'temperature', false),
        row('Winter Low (Jan)', 'climate', 'avg_low_jan', 'temperature', true),
        row('Sunny Days / Year', 'climate', 'sunny_days', 'days', true),
        row('Rainy Days / Year', 'climate', 'rainy_days', 'days', false),
        row('Annual Precipitation', 'climate', 'annual_precipitation', 'inches', false),
        row('Annual Snowfall', 'climate', 'annual_snowfall', 'inches', false),
        row('Comfort Index', 'climate', 'comfort_index', 'score', true),
        row('Avg Humidity', 'climate', 'avg_humidity', 'percent', false),
      ],
    },
    {
      title: 'Safety', icon: Shield, color: '#ef4444',
      rows: [
        row('Violent Crime Rate', 'safety', 'violent_crime_rate', 'rate', false, NATIONAL_AVERAGES.violent_crime_rate),
        row('Property Crime Rate', 'safety', 'property_crime_rate', 'rate', false, NATIONAL_AVERAGES.property_crime_rate),
        row('Total Crime Rate', 'safety', 'total_crime_rate', 'rate', false),
        row('Safety Score', 'safety', 'safety_score', 'score', true),
      ],
    },
    {
      title: 'Education', icon: GraduationCap, color: '#a855f7',
      rows: [
        row('High School Grad %', 'education', 'high_school_grad_pct', 'percent', true),
        row("Bachelor's Degree %", 'education', 'bachelors_pct', 'percent', true, NATIONAL_AVERAGES.bachelors_pct),
        row('Graduate Degree %', 'education', 'graduate_pct', 'percent', true),
      ],
    },
    {
      title: 'Livability', icon: TreePine, color: '#14b8a6',
      rows: [
        row('Walk Score', 'livability', 'walkscore', 'score', true),
        row('Transit Score', 'livability', 'transit_score', 'score', true),
        row('Bike Score', 'livability', 'bike_score', 'score', true),
        row('Avg Commute Time', 'livability', 'commute_time_avg', 'minutes', false, NATIONAL_AVERAGES.commute_time_avg),
        row('Broadband Access', 'livability', 'broadband_pct', 'percent', true),
        row('Air Quality (AQI)', 'livability', 'aqi_avg', 'number', false),
        row('Parks per 10K', 'livability', 'parks_per_capita', 'number', true),
      ],
    },
  ];
}

// ── Victory Summary ────────────────────────
function computeVerdicts(sections: CompareSection[], profiles: CityProfile[]) {
  const wins: number[] = profiles.map(() => 0);
  let ties = 0;
  let totalMetrics = 0;

  for (const section of sections) {
    for (const row of section.rows) {
      const valid = row.values.map((v, i) => ({ val: v, idx: i })).filter(x => x.val !== null && x.val !== undefined && !isNaN(x.val as number));
      if (valid.length < 2) continue;
      totalMetrics++;
      let bestVal: number;
      if (row.higherIsBetter) {
        bestVal = Math.max(...valid.map(x => x.val as number));
      } else {
        bestVal = Math.min(...valid.map(x => x.val as number));
      }
      const winners = valid.filter(x => x.val === bestVal);
      if (winners.length === 1) {
        wins[winners[0].idx]++;
      } else {
        ties++;
      }
    }
  }

  return { wins, ties, totalMetrics };
}

export default function CompareClient({ initialFips }: { initialFips?: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [slots, setSlots] = useState<(CitySlot | null)[]>([null, null]);
  const [profiles, setProfiles] = useState<CityProfile[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Urbindex Scores': true,
    'Demographics': true,
    'Economy': true,
    'Housing': true,
    'Climate': false,
    'Safety': true,
    'Education': false,
    'Livability': false,
  });
  const [loading, setLoading] = useState(false);

  // Initialize from URL params
  useEffect(() => {
    const citiesParam = searchParams.get('cities');
    if (citiesParam) {
      const fipsCodes = citiesParam.split(',').filter(Boolean).slice(0, 4);
      if (fipsCodes.length > 0) {
        setLoading(true);
        import('@/lib/supabase').then(({ supabase }) => {
          supabase
            .from('cities')
            .select('fips_code, name, state, state_code, population, slug')
            .in('fips_code', fipsCodes)
            .then(({ data }) => {
              if (data) {
                const newSlots: (CitySlot | null)[] = fipsCodes.map(fips =>
                  data.find(c => c.fips_code === fips) || null
                );
                while (newSlots.length < 2) newSlots.push(null);
                setSlots(newSlots);
              }
            });
        });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch comparison data when slots change
  useEffect(() => {
    const selectedFips = slots.filter(Boolean).map(s => s!.fips_code);
    if (selectedFips.length < 2) {
      setProfiles([]);
      return;
    }

    const newParams = new URLSearchParams();
    newParams.set('cities', selectedFips.join(','));
    router.replace(`/compare?${newParams.toString()}`, { scroll: false });

    setLoading(true);
    startTransition(async () => {
      const data = await fetchCityComparison(selectedFips);
      setProfiles(data);
      setLoading(false);
    });
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (index: number, city: CitySlot) => {
    if (slots.some(s => s?.fips_code === city.fips_code)) return;
    const newSlots = [...slots];
    newSlots[index] = city;
    setSlots(newSlots);
  };

  const handleRemove = (index: number) => {
    const newSlots = [...slots];
    newSlots[index] = null;
    while (newSlots.length > 2 && newSlots[newSlots.length - 1] === null) {
      newSlots.pop();
    }
    setSlots(newSlots);
  };

  const addSlot = () => {
    if (slots.length < 4) {
      setSlots([...slots, null]);
    }
  };

  const loadPreset = (fipsCodes: string[]) => {
    setLoading(true);
    import('@/lib/supabase').then(({ supabase }) => {
      supabase
        .from('cities')
        .select('fips_code, name, state, state_code, population, slug')
        .in('fips_code', fipsCodes)
        .then(({ data }) => {
          if (data) {
            const newSlots: (CitySlot | null)[] = fipsCodes.map(fips =>
              data.find(c => c.fips_code === fips) || null
            );
            setSlots(newSlots);
          }
        });
    });
  };

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const sections = profiles.length >= 2 ? buildSections(profiles) : [];
  const verdict = profiles.length >= 2 ? computeVerdicts(sections, profiles) : null;

  // Radar chart data
  const radarData = profiles.length >= 2 ? [
    { metric: 'Livability', ...Object.fromEntries(profiles.map((p, i) => [`city${i}`, p.computed_scores?.overall_livability || 0])) },
    { metric: 'Affordability', ...Object.fromEntries(profiles.map((p, i) => [`city${i}`, p.computed_scores?.affordability_index || 0])) },
    { metric: 'City Pulse', ...Object.fromEntries(profiles.map((p, i) => [`city${i}`, p.computed_scores?.cultural_density_index || 0])) },
    { metric: 'Hidden Gem', ...Object.fromEntries(profiles.map((p, i) => [`city${i}`, p.computed_scores?.hidden_gem_score || 0])) },
    { metric: 'Econ Resilience', ...Object.fromEntries(profiles.map((p, i) => [`city${i}`, p.computed_scores?.economic_resilience || 0])) },
  ] : [];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 var(--space-lg)' }}>
      {/* Page header */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 'var(--space-sm)' }}>
          Compare Cities
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', maxWidth: 600, margin: '0 auto' }}>
          Select 2–4 cities to compare side-by-side across every data metric.
        </p>
      </div>

      {/* Quick-Compare Presets (#4) */}
      {profiles.length < 2 && !loading && (
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <div style={{
            fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-sm)', textAlign: 'center',
          }}>
            <Zap size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Quick Compare
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center',
          }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => loadPreset(preset.fips)}
                style={{
                  background: 'var(--color-bg-glass)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-full)', padding: '8px 16px',
                  color: 'var(--color-text-secondary)', cursor: 'pointer',
                  fontSize: '0.85rem', fontFamily: 'inherit', transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                  e.currentTarget.style.background = 'rgba(6, 214, 160, 0.06)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                  e.currentTarget.style.background = 'var(--color-bg-glass)';
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* City selectors */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${slots.length}, 1fr)${slots.length < 4 ? ' auto' : ''}`,
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-xl)',
        alignItems: 'start',
      }}>
        {slots.map((slot, idx) => (
          <div key={idx}>
            <div style={{
              fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: CITY_COLORS[idx], marginBottom: '6px',
            }}>
              City {idx + 1}
            </div>
            <CityPicker
              selected={slot}
              onSelect={(city) => handleSelect(idx, city)}
              onRemove={() => handleRemove(idx)}
              placeholder={`Search city ${idx + 1}...`}
              autoFocus={idx === 0 && !slot}
            />
            {/* View City Profile button (#2) */}
            {slot && (
              <Link
                href={getCityUrl(slot.state_code, slot.slug)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  marginTop: '6px', padding: '7px 12px',
                  fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit',
                  color: CITY_COLORS[idx], background: 'transparent',
                  border: `1px solid ${CITY_COLORS[idx]}33`,
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none', transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = `${CITY_COLORS[idx]}15`;
                  e.currentTarget.style.borderColor = `${CITY_COLORS[idx]}66`;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = `${CITY_COLORS[idx]}33`;
                }}
              >
                View {slot.name} Profile <ExternalLink size={12} />
              </Link>
            )}
          </div>
        ))}
        {slots.length < 4 && (
          <div style={{ alignSelf: 'end' }}>
            <button
              onClick={addSlot}
              style={{
                background: 'var(--color-bg-glass)', border: '1px dashed var(--color-border)',
                borderRadius: 'var(--radius-lg)', padding: '16px',
                color: 'var(--color-text-tertiary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '6px', fontSize: '0.85rem', width: '100%', minHeight: '56px',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent)';
                e.currentTarget.style.color = 'var(--color-accent)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.color = 'var(--color-text-tertiary)';
              }}
            >
              <Plus size={16} /> Add City
            </button>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{
          textAlign: 'center', padding: 'var(--space-3xl)',
          color: 'var(--color-text-tertiary)', fontSize: '1rem',
        }}>
          Loading comparison data...
        </div>
      )}

      {/* Empty state */}
      {!loading && profiles.length < 2 && (
        <div style={{
          textAlign: 'center', padding: 'var(--space-3xl)',
          color: 'var(--color-text-tertiary)',
          background: 'var(--color-bg-glass)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }}>⚖️</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '4px' }}>Select two or more cities to compare</div>
          <div style={{ fontSize: '0.9rem' }}>Use the search boxes above or try a quick compare preset</div>
        </div>
      )}

      {/* Victory Summary Card (#1) */}
      {profiles.length >= 2 && !loading && verdict && (
        <div style={{
          background: 'var(--color-bg-card)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)', padding: 'var(--space-lg)',
          marginBottom: 'var(--space-xl)',
        }}>
          <div style={{
            fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--space-md)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <Trophy size={18} style={{ color: '#f59e0b' }} />
            Which City Wins?
          </div>

          {/* Win bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: 'var(--space-md)' }}>
            {profiles.map((p, i) => {
              const pct = verdict.totalMetrics > 0 ? (verdict.wins[i] / verdict.totalMetrics) * 100 : 0;
              const isTopWinner = verdict.wins[i] === Math.max(...verdict.wins);
              return (
                <div key={p.city.fips_code} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '120px', fontSize: '0.85rem', fontWeight: 700,
                    color: CITY_COLORS[i], flexShrink: 0, textAlign: 'right',
                  }}>
                    {p.city.name}
                  </div>
                  <div style={{
                    flex: 1, height: '28px', background: 'rgba(255,255,255,0.03)',
                    borderRadius: 'var(--radius-md)', overflow: 'hidden', position: 'relative',
                  }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: `linear-gradient(90deg, ${CITY_COLORS[i]}33, ${CITY_COLORS[i]}88)`,
                      borderRadius: 'var(--radius-md)',
                      transition: 'width 0.6s ease-out',
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                      paddingRight: '8px',
                    }}>
                      {pct > 15 && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>
                          {verdict.wins[i]} wins
                        </span>
                      )}
                    </div>
                    {pct <= 15 && (
                      <span style={{
                        position: 'absolute', left: `calc(${pct}% + 8px)`, top: '50%', transform: 'translateY(-50%)',
                        fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-tertiary)',
                      }}>
                        {verdict.wins[i]} wins
                      </span>
                    )}
                  </div>
                  {isTopWinner && verdict.wins[i] > 0 && (
                    <span style={{ fontSize: '0.8rem' }}>👑</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary text */}
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
            {verdict.ties > 0 && `${verdict.ties} tied · `}
            {verdict.totalMetrics} metrics compared
          </div>
        </div>
      )}

      {/* Radar chart */}
      {profiles.length >= 2 && !loading && (
        <div style={{
          background: 'var(--color-bg-card)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)', padding: 'var(--space-lg)',
          marginBottom: 'var(--space-xl)',
        }}>
          <div style={{
            fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--space-md)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <Star size={18} style={{ color: '#f97316' }} />
            Urbindex Score Comparison
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }} />
              {profiles.map((p, i) => (
                <Radar
                  key={p.city.fips_code}
                  name={`${p.city.name}, ${p.city.state_code}`}
                  dataKey={`city${i}`}
                  stroke={CITY_COLORS[i]}
                  fill={CITY_COLORS[i]}
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: '0.85rem' }} />
              <Tooltip
                contentStyle={{
                  background: '#111827', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, fontSize: '0.85rem',
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Comparison table */}
      {profiles.length >= 2 && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {sections.map((section) => {
            const isExpanded = expandedSections[section.title] ?? true;
            return (
              <div key={section.title} style={{
                background: 'var(--color-bg-card)', borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--color-border)', overflow: 'hidden',
              }}>
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.title)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '16px 20px', background: 'transparent', border: 'none',
                    cursor: 'pointer', color: 'var(--color-text-primary)',
                    borderBottom: isExpanded ? '1px solid var(--color-border)' : 'none',
                  }}
                >
                  <section.icon size={20} style={{ color: section.color }} />
                  <span style={{ fontWeight: 700, fontSize: '1.05rem', flex: 1, textAlign: 'left' }}>
                    {section.title}
                  </span>
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>

                {/* Table rows */}
                {isExpanded && (
                  <div style={{ overflowX: 'auto' }}>
                    {/* Sticky city header row */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `200px repeat(${profiles.length}, 1fr)`,
                      borderBottom: '1px solid var(--color-border)',
                      position: 'sticky', top: 0, zIndex: 2,
                      background: 'var(--color-bg-card)',
                    }}>
                      <div style={{ padding: '10px 20px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Metric
                      </div>
                      {profiles.map((p, i) => (
                        <div key={p.city.fips_code} style={{
                          padding: '10px 16px', fontSize: '0.8rem', fontWeight: 700,
                          color: CITY_COLORS[i], textAlign: 'center',
                          borderLeft: '1px solid var(--color-border)',
                        }}>
                          {p.city.name}
                        </div>
                      ))}
                    </div>

                    {/* Data rows with inline bar visualization (#5) */}
                    {section.rows.map((row, ri) => {
                      // Determine winner (no highlight on ties)
                      const validValues = row.values.map((v, i) => ({ val: v, idx: i })).filter(x => x.val !== null && x.val !== undefined && !isNaN(x.val as number));
                      let winnerIdx = -1;
                      if (validValues.length >= 2) {
                        let bestVal: number;
                        if (row.higherIsBetter) {
                          bestVal = Math.max(...validValues.map(x => x.val as number));
                        } else {
                          bestVal = Math.min(...validValues.map(x => x.val as number));
                        }
                        const winners = validValues.filter(x => x.val === bestVal);
                        if (winners.length === 1) {
                          winnerIdx = winners[0].idx;
                        }
                      }

                      // Compute bar widths relative to max value in this row
                      const absValues = validValues.map(x => Math.abs(x.val as number));
                      const maxAbs = Math.max(...absValues, 1); // avoid /0

                      return (
                        <div key={row.key} style={{
                          display: 'grid',
                          gridTemplateColumns: `200px repeat(${profiles.length}, 1fr)`,
                          borderBottom: ri < section.rows.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                        }}>
                          <div style={{
                            padding: '12px 20px', fontSize: '0.85rem', fontWeight: 500,
                            color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center',
                          }}>
                            {row.label}
                          </div>
                          {row.values.map((val, ci) => {
                            const isWinner = ci === winnerIdx && validValues.length >= 2;
                            const barPct = val !== null && val !== undefined && !isNaN(val)
                              ? (Math.abs(val) / maxAbs) * 100
                              : 0;
                            const barColor = isWinner ? 'rgba(6, 214, 160, 0.12)' : 'rgba(255, 255, 255, 0.04)';

                            return (
                              <div key={ci} style={{
                                padding: '12px 16px', textAlign: 'center',
                                borderLeft: '1px solid var(--color-border)',
                                position: 'relative', overflow: 'hidden',
                              }}>
                                {/* Background bar (#5) */}
                                <div style={{
                                  position: 'absolute', left: 0, top: 0, bottom: 0,
                                  width: `${barPct}%`, background: barColor,
                                  transition: 'width 0.4s ease-out',
                                }} />
                                {/* Value text */}
                                <span style={{
                                  position: 'relative', zIndex: 1,
                                  fontFamily: 'var(--font-mono)', fontSize: '0.9rem',
                                  fontWeight: isWinner ? 700 : 400,
                                  color: isWinner ? '#06d6a0' : 'var(--color-text-primary)',
                                }}>
                                  {fmtVal(val, row.format)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom spacer */}
      <div style={{ height: 'var(--space-3xl)' }} />
    </div>
  );
}
