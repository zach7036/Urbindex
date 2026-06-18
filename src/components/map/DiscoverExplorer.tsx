'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Loader2, LocateFixed, MapPin } from 'lucide-react';
import CityPicker from '@/components/compare/CityPicker';
import { fetchAllCityRows, percentileScores, getNum, haversineMiles, CityRow } from '@/lib/cities-data';
import { METRICS, CATEGORIES, formatMetricValue, MetricDef } from '@/lib/metrics';
import { scoreToColor, TIER_RADIUS } from './color';
import { getCityUrl, formatNumberFull } from '@/lib/utils';
import type { RadiusPoint } from './RadiusMap';

const RadiusMap = dynamic(() => import('./RadiusMap'), {
  ssr: false,
  loading: () => (
    <div className="urbindex-map map-skeleton">
      <Loader2 size={28} className="analytics-spinner" />
      <span>Loading map…</span>
    </div>
  ),
});

interface CityResult {
  fips_code: string; name: string; state: string; state_code: string; population: number; slug: string;
}
interface Center { lat: number; lng: number }

const MILES_TO_M = 1609.34;

export default function DiscoverExplorer() {
  const [rows, setRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [center, setCenter] = useState<Center | null>(null);
  const [flyToken, setFlyToken] = useState(0);
  const [anchorCity, setAnchorCity] = useState<CityResult | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(50);
  const [metricKey, setMetricKey] = useState('overall_livability');
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllCityRows()
      .then(setRows)
      .catch((e) => setError(e.message || 'Failed to load city data'))
      .finally(() => setLoading(false));
  }, []);

  // Derive the map center from the chosen anchor city. Done reactively (not in
  // the click handler) so picking a city before the ~4k-row dataset has loaded
  // still works — the center snaps in the moment the rows arrive.
  useEffect(() => {
    if (!anchorCity) return;
    const row = rows.find(r => r.fips_code === anchorCity.fips_code);
    if (!row) return;
    const lat = getNum(row.latitude), lng = getNum(row.longitude);
    if (lat !== null && lng !== null) {
      setCenter({ lat, lng });
      setFlyToken(t => t + 1);
    }
  }, [anchorCity, rows]);

  const metric: MetricDef = useMemo(
    () => METRICS.find(m => m.key === metricKey) ?? METRICS[0],
    [metricKey],
  );

  // Cities within the radius, ranked by the chosen metric.
  const results = useMemo(() => {
    if (!center) return [];
    const within: { row: CityRow; distance: number }[] = [];
    for (const r of rows) {
      const lat = getNum(r.latitude), lng = getNum(r.longitude);
      if (lat === null || lng === null) continue;
      const d = haversineMiles(center.lat, center.lng, lat, lng);
      if (d <= radiusMiles) within.push({ row: r, distance: d });
    }
    const scoreMap = percentileScores(within.map(w => w.row), metric.key, metric.higherIsBetter);
    return within
      .map(w => ({ ...w, value: getNum(w.row[metric.key]), score: scoreMap.get(w.row.fips_code) }))
      .sort((a, b) => {
        // Cities with the metric present rank above those without.
        if (a.value === null && b.value === null) return a.distance - b.distance;
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return (b.score ?? 0) - (a.score ?? 0);
      });
  }, [center, rows, radiusMiles, metric]);

  const points = useMemo<RadiusPoint[]>(() => {
    return results.map(r => ({
      fips: r.row.fips_code, name: r.row.name, state_code: r.row.state_code, slug: r.row.slug,
      lat: r.row.latitude, lng: r.row.longitude,
      label: r.value !== null ? `${metric.label}: ${formatMetricValue(r.value, metric.format)}` : 'No data',
      distance: r.distance,
      color: r.score !== undefined ? scoreToColor(r.score) : '#64748b',
      radius: TIER_RADIUS[r.row.city_class] ?? 4,
    }));
  }, [results, metric]);

  // Just record the selection; the center is derived by the effect above.
  function anchorToCity(c: CityResult) {
    setAnchorCity(c);
    setGeoError(null);
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) { setGeoError('Geolocation not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAnchorCity(null);
        setFlyToken(t => t + 1);
        setGeoError(null);
      },
      () => setGeoError('Could not get your location. Try clicking the map instead.'),
    );
  }

  function onMapPick(lat: number, lng: number) {
    setCenter({ lat, lng });
    setAnchorCity(null); // a raw pin isn't a named city
  }

  if (error) {
    return <div className="analytics-loading"><p style={{ color: 'var(--color-danger)' }}>Error: {error}</p></div>;
  }

  return (
    <div>
      {/* Controls */}
      <div className="discover-controls">
        <div className="discover-anchor">
          <CityPicker selected={anchorCity} onSelect={anchorToCity} onRemove={() => { setAnchorCity(null); setCenter(null); }} placeholder="Anchor to a city…" />
        </div>
        <button className="discover-geo-btn" onClick={useMyLocation}><LocateFixed size={15} /> Use my location</button>
        <label className="map-metric-select">
          <span>Rank by</span>
          <select value={metricKey} onChange={e => setMetricKey(e.target.value)}>
            {CATEGORIES.map(cat => (
              <optgroup key={cat.key} label={cat.label}>
                {METRICS.filter(m => m.category === cat.key).map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="discover-radius">
          <span>Radius: <strong>{radiusMiles} mi</strong></span>
          <input type="range" min={10} max={250} step={10} value={radiusMiles} onChange={e => setRadiusMiles(Number(e.target.value))} />
        </label>
      </div>
      {geoError && <p className="discover-geo-error">{geoError}</p>}

      {/* Map + results */}
      <div className="discover-layout">
        <RadiusMap center={center} radiusMeters={radiusMiles * MILES_TO_M} points={points} onPick={onMapPick} flyToken={flyToken} />

        <div className="discover-results">
          {!center ? (
            <div className="discover-prompt">
              <MapPin size={24} style={{ color: 'var(--color-accent)' }} />
              <p>Anchor to a city, use your location, or click the map to start.</p>
            </div>
          ) : (
            <>
              <div className="discover-results-head">
                {results.length.toLocaleString()} cities within {radiusMiles} mi
              </div>
              <div className="discover-results-list">
                {results.slice(0, 50).map((r, idx) => (
                  <Link key={r.row.fips_code} href={getCityUrl(r.row.state_code, r.row.slug)} className="discover-result">
                    <span className="discover-result-rank">{idx + 1}</span>
                    <span className="discover-result-main">
                      <span className="discover-result-name">{r.row.name}, {r.row.state_code}</span>
                      <span className="discover-result-sub">{formatNumberFull(r.row.population)} · {r.distance.toFixed(0)} mi</span>
                    </span>
                    <span className="discover-result-val">{r.value !== null ? formatMetricValue(r.value, metric.format) : '—'}</span>
                  </Link>
                ))}
                {results.length === 0 && <div className="discover-prompt"><p>No cities in range. Try a larger radius.</p></div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
