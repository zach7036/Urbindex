// ============================================================
// Urbindex — Cost-of-living model
//
// We don't license a commercial COL index, so we derive a transparent one
// from the housing data we already hold. Housing is ~a third of a typical
// household budget and accounts for the large majority of cost-of-living
// variation between US cities, so we let local housing scale against the
// national average and hold non-housing costs near national. This is an
// ESTIMATE and is labeled as such everywhere it surfaces.
// ============================================================
import { NATIONAL_AVERAGES } from '@/lib/constants';

// Share of a typical household budget that is housing. The rest is treated
// as roughly national-average everywhere (a deliberately conservative choice
// that understates rather than fabricates intercity differences).
const HOUSING_SHARE = 0.33;

export interface ColInputs {
  median_rent?: number | null;
  median_home_value?: number | null;
}

/**
 * Cost-of-living index where 100 = national average.
 * Prefers rent (a direct monthly cost); falls back to home value when a city
 * is missing rent. Returns null only when neither is available.
 */
export function colIndex(city: ColInputs): number | null {
  const natRent = NATIONAL_AVERAGES.median_rent;
  const natHome = NATIONAL_AVERAGES.median_home_value;

  let housingRatio: number | null = null;
  if (typeof city.median_rent === 'number' && city.median_rent > 0) {
    housingRatio = city.median_rent / natRent;
  } else if (typeof city.median_home_value === 'number' && city.median_home_value > 0) {
    housingRatio = city.median_home_value / natHome;
  }
  if (housingRatio === null) return null;

  const multiplier = (1 - HOUSING_SHARE) + HOUSING_SHARE * housingRatio;
  return multiplier * 100;
}

/**
 * Monthly principal + interest for a fixed-rate mortgage.
 * Used by the affordability simulator's "Buy" mode.
 */
export function monthlyMortgage(
  homeValue: number,
  downPct: number,
  annualRatePct: number,
  termYears: number,
): number {
  const loan = homeValue * (1 - downPct / 100);
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return loan / n;
  return (loan * r) / (1 - Math.pow(1 + r, -n));
}

// Rough combined property-tax + homeowner's-insurance rate (annual, as a share
// of home value). Used to turn a mortgage P&I into a fuller monthly housing
// cost. An estimate, labeled as such in the UI.
export const PROPERTY_TAX_INS_RATE = 0.0125;

/** The salary in `toCity` that preserves `fromSalary`'s buying power. */
export function equivalentSalary(fromSalary: number, fromCol: number, toCol: number): number {
  if (!fromCol) return fromSalary;
  return fromSalary * (toCol / fromCol);
}

// ─── State income tax (approximate effective rates) ──────────
// Rough effective rates on wage income for a typical middle-income household,
// expressed as a percentage. Intended for ballpark take-home comparison only,
// NOT tax advice. States with no wage income tax are 0.
export const STATE_INCOME_TAX: Record<string, number> = {
  AK: 0, FL: 0, NV: 0, SD: 0, TX: 0, WA: 0, WY: 0, TN: 0, NH: 0,
  AZ: 2.5, CO: 4.4, ID: 5.8, IL: 4.95, IN: 3.15, IA: 3.8, KY: 4.0,
  MA: 5.0, MI: 4.25, NC: 4.5, PA: 3.07, UT: 4.65, GA: 5.39,
  CA: 6.0, NY: 5.5, NJ: 3.5, VA: 5.0, MD: 4.75, OR: 8.0, MN: 6.8,
  WI: 5.3, OH: 3.0, SC: 4.0, MO: 4.0, OK: 3.75, AL: 4.5, AR: 3.9,
  LA: 3.0, MS: 4.7, NE: 5.0, NM: 4.0, KS: 5.0, CT: 5.0, RI: 4.5,
  ME: 6.0, VT: 6.0, MT: 5.9, ND: 1.5, HI: 7.5, WV: 4.5, DE: 5.0, DC: 6.5,
};

export function stateTaxRate(stateCode: string): number {
  return STATE_INCOME_TAX[stateCode] ?? 4.5; // national-ish fallback
}

export const NO_INCOME_TAX_STATES = new Set(
  Object.entries(STATE_INCOME_TAX).filter(([, r]) => r === 0).map(([s]) => s),
);
