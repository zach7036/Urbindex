'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, TrendingUp, TrendingDown, Home, Landmark, Info } from 'lucide-react';
import CityPicker from '@/components/compare/CityPicker';
import { supabase } from '@/lib/supabase';
import { colIndex, equivalentSalary, stateTaxRate, NO_INCOME_TAX_STATES } from '@/lib/col';
import { formatCurrencyFull } from '@/lib/utils';

interface CityResult {
  fips_code: string;
  name: string;
  state: string;
  state_code: string;
  population: number;
  slug: string;
}

interface Housing {
  median_rent: number | null;
  median_home_value: number | null;
}

function useHousing(fips: string | undefined): Housing | null {
  const [data, setData] = useState<Housing | null>(null);
  useEffect(() => {
    if (!fips) { setData(null); return; }
    let active = true;
    supabase
      .from('city_housing')
      .select('median_rent, median_home_value')
      .eq('fips_code', fips)
      .order('year', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => { if (active) setData(data ?? { median_rent: null, median_home_value: null }); });
    return () => { active = false; };
  }, [fips]);
  return data;
}

export default function CostOfLivingClient() {
  const [from, setFrom] = useState<CityResult | null>(null);
  const [to, setTo] = useState<CityResult | null>(null);
  const [salary, setSalary] = useState<number>(75000);

  const fromHousing = useHousing(from?.fips_code);
  const toHousing = useHousing(to?.fips_code);

  const ready = from && to && fromHousing && toHousing && salary > 0;

  let result: null | {
    fromCol: number | null;
    toCol: number | null;
    equiv: number;
    delta: number;
    fromTax: number;
    toTax: number;
    fromTakeHome: number;
    toTakeHome: number;
  } = null;

  if (ready) {
    const fromCol = colIndex(fromHousing!);
    const toCol = colIndex(toHousing!);
    if (fromCol && toCol) {
      const equiv = equivalentSalary(salary, fromCol, toCol);
      const fromRate = stateTaxRate(from!.state_code);
      const toRate = stateTaxRate(to!.state_code);
      result = {
        fromCol, toCol, equiv,
        delta: (equiv - salary) / salary,
        fromTax: fromRate,
        toTax: toRate,
        fromTakeHome: salary * (1 - fromRate / 100),
        toTakeHome: equiv * (1 - toRate / 100),
      };
    }
  }

  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

  return (
    <div>
      {/* Inputs */}
      <div className="col-inputs">
        <div className="col-input-block">
          <label className="col-input-label">Your current city</label>
          <CityPicker selected={from} onSelect={setFrom} onRemove={() => setFrom(null)} placeholder="Where you live now…" />
        </div>
        <div className="col-input-block">
          <label className="col-input-label">Your household income</label>
          <div className="col-salary-wrap">
            <span>$</span>
            <input
              type="number" min={0} step={1000} value={salary}
              onChange={e => setSalary(Number(e.target.value) || 0)}
              className="col-salary-input no-focus-ring"
            />
            <span className="col-salary-suffix">/ year</span>
          </div>
        </div>
        <div className="col-input-block">
          <label className="col-input-label">City you&apos;re considering</label>
          <CityPicker selected={to} onSelect={setTo} onRemove={() => setTo(null)} placeholder="Where you might move…" />
        </div>
      </div>

      {/* Result */}
      {result ? (
        <div className="col-result">
          <div className="col-headline">
            <div className="col-headline-label">To keep your lifestyle in {to!.name}, you&apos;d need</div>
            <div className="col-headline-value">{formatCurrencyFull(Math.round(result.equiv))}<span>/ yr</span></div>
            <div className={`col-headline-delta ${result.delta >= 0 ? 'up' : 'down'}`}>
              {result.delta >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {Math.abs(result.delta * 100).toFixed(0)}% {result.delta >= 0 ? 'more' : 'less'} than your {formatCurrencyFull(salary)} today
            </div>
          </div>

          {/* COL index bars */}
          <div className="col-cards">
            <div className="col-card">
              <div className="col-card-title">Cost of living index <span className="col-hint">(100 = national avg)</span></div>
              <div className="col-bar-row">
                <span className="col-bar-name">{from!.name}, {from!.state_code}</span>
                <div className="col-bar-track"><div className="col-bar-fill from" style={{ width: `${Math.min(100, (result.fromCol! / 200) * 100)}%` }} /></div>
                <span className="col-bar-val">{Math.round(result.fromCol!)}</span>
              </div>
              <div className="col-bar-row">
                <span className="col-bar-name">{to!.name}, {to!.state_code}</span>
                <div className="col-bar-track"><div className="col-bar-fill to" style={{ width: `${Math.min(100, (result.toCol! / 200) * 100)}%` }} /></div>
                <span className="col-bar-val">{Math.round(result.toCol!)}</span>
              </div>
            </div>

            {/* Housing */}
            <div className="col-card">
              <div className="col-card-title"><Home size={14} /> Housing</div>
              <div className="col-compare-grid">
                <div className="col-compare-metric">
                  <span className="col-compare-label">Median rent</span>
                  <div className="col-compare-vals">
                    <span>{fromHousing!.median_rent ? formatCurrencyFull(fromHousing!.median_rent) : '—'}</span>
                    <ArrowRight size={13} />
                    <span>{toHousing!.median_rent ? formatCurrencyFull(toHousing!.median_rent) : '—'}</span>
                  </div>
                  {fromHousing!.median_rent && toHousing!.median_rent && (
                    <span className={`col-diff ${toHousing!.median_rent >= fromHousing!.median_rent ? 'up' : 'down'}`}>
                      {pct(toHousing!.median_rent, fromHousing!.median_rent) >= 0 ? '+' : ''}{pct(toHousing!.median_rent, fromHousing!.median_rent).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="col-compare-metric">
                  <span className="col-compare-label">Median home value</span>
                  <div className="col-compare-vals">
                    <span>{fromHousing!.median_home_value ? formatCurrencyFull(fromHousing!.median_home_value) : '—'}</span>
                    <ArrowRight size={13} />
                    <span>{toHousing!.median_home_value ? formatCurrencyFull(toHousing!.median_home_value) : '—'}</span>
                  </div>
                  {fromHousing!.median_home_value && toHousing!.median_home_value && (
                    <span className={`col-diff ${toHousing!.median_home_value >= fromHousing!.median_home_value ? 'up' : 'down'}`}>
                      {pct(toHousing!.median_home_value, fromHousing!.median_home_value) >= 0 ? '+' : ''}{pct(toHousing!.median_home_value, fromHousing!.median_home_value).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* State income tax */}
            <div className="col-card">
              <div className="col-card-title"><Landmark size={14} /> State income tax <span className="col-hint">(estimated effective)</span></div>
              <div className="col-compare-grid">
                <div className="col-compare-metric">
                  <span className="col-compare-label">{from!.state_code}</span>
                  <div className="col-tax-val">{result.fromTax === 0 ? 'No income tax' : `~${result.fromTax.toFixed(1)}%`}</div>
                </div>
                <div className="col-compare-metric">
                  <span className="col-compare-label">{to!.state_code}</span>
                  <div className="col-tax-val">{result.toTax === 0 ? 'No income tax' : `~${result.toTax.toFixed(1)}%`}</div>
                </div>
              </div>
              {NO_INCOME_TAX_STATES.has(to!.state_code) && !NO_INCOME_TAX_STATES.has(from!.state_code) && (
                <div className="col-tax-note good">
                  {to!.state} has no state income tax — roughly {formatCurrencyFull(Math.round(result.equiv * result.fromTax / 100))}/yr back in your pocket vs {from!.state_code}.
                </div>
              )}
              <div className="col-takehome">
                Estimated take-home: <strong>{formatCurrencyFull(Math.round(result.fromTakeHome))}</strong> in {from!.state_code}
                {' '}vs <strong>{formatCurrencyFull(Math.round(result.toTakeHome))}</strong> in {to!.state_code}
              </div>
            </div>
          </div>

          <div className="col-disclaimer">
            <Info size={13} />
            Estimate. The cost-of-living index is derived primarily from local housing costs (the largest driver of intercity cost differences); non-housing costs are assumed near the national average. Tax figures are approximate effective rates, not tax advice.
          </div>
        </div>
      ) : (
        <div className="col-placeholder">
          {(from || to) ? 'Pick both cities and enter an income to compare.' : 'Choose your current city and a destination to begin.'}
        </div>
      )}
    </div>
  );
}
