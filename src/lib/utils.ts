// ============================================================
// Urbindex — Utility Functions
// ============================================================

export function formatCurrency(value: number): string {
  if (value === undefined || value === null) return 'N/A';
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

export function formatCurrencyFull(value: number): string {
  if (value === undefined || value === null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  if (value === undefined || value === null) return 'N/A';
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  if (value === undefined || value === null) return 'N/A';
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

export function formatNumberFull(value: number): string {
  if (value === undefined || value === null) return 'N/A';
  return value.toLocaleString('en-US');
}

export function formatTemperature(value: number): string {
  if (value === undefined || value === null) return 'N/A';
  return `${Math.round(value)}°F`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function stateSlug(state: string): string {
  return slugify(state);
}

export function getCityUrl(stateCode: string, slug: string): string {
  const stateName = STATE_NAMES[stateCode] || stateCode;
  return `/city/${slugify(stateName)}/${slug}`;
}

export function getComparisonColor(
  cityValue: number,
  avgValue: number,
  higherIsBetter: boolean
): string {
  if (cityValue === undefined || cityValue === null || avgValue === undefined || avgValue === null) return 'var(--color-text-tertiary)';
  
  const ratio = cityValue / avgValue;
  if (higherIsBetter) {
    if (ratio >= 1.15) return 'var(--color-success)';
    if (ratio >= 0.95) return 'var(--color-warning)';
    return 'var(--color-danger)';
  } else {
    if (ratio <= 0.85) return 'var(--color-success)';
    if (ratio <= 1.05) return 'var(--color-warning)';
    return 'var(--color-danger)';
  }
}

export function getComparisonLabel(
  cityValue: number,
  avgValue: number
): string {
  if (cityValue === undefined || cityValue === null || avgValue === undefined || avgValue === null) return 'No data';
  
  const diff = ((cityValue - avgValue) / avgValue) * 100;
  const absDiff = Math.abs(diff);
  const direction = diff > 0 ? 'higher' : 'lower';

  if (absDiff < 3) return 'Near average';
  return `${absDiff.toFixed(0)}% ${direction}`;
}

export function getCityClass(population: number): 'large' | 'mid' | 'small' | 'micro' {
  if (population >= 250000) return 'large';
  if (population >= 100000) return 'mid';
  if (population >= 50000) return 'small';
  return 'micro';
}

export function getCityClassLabel(cityClass: string): string {
  switch (cityClass) {
    case 'large': return 'Large City (250K+)';
    case 'mid': return 'Mid-Size City (100K-250K)';
    case 'small': return 'Small City (50K-100K)';
    case 'micro': return 'Micro City (10K-50K)';
    default: return cityClass;
  }
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'var(--color-success)';
  if (score >= 60) return 'var(--color-info)';
  if (score >= 40) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Very Good';
  if (score >= 50) return 'Good';
  if (score >= 30) return 'Fair';
  return 'Poor';
}

export function getAQILabel(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive';
  if (aqi <= 200) return 'Unhealthy';
  return 'Very Unhealthy';
}

export function getAQIColor(aqi: number): string {
  if (aqi <= 50) return 'var(--color-success)';
  if (aqi <= 100) return 'var(--color-warning)';
  if (aqi <= 150) return '#ff8c00';
  if (aqi <= 200) return 'var(--color-danger)';
  return '#7e0023';
}

// State abbreviation to full name mapping
export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

// Reverse mapping
export const STATE_CODES: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([code, name]) => [name, code])
);
