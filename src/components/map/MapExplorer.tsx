'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { fetchAllCityRows, percentileScores, getNum, CityRow } from '@/lib/cities-data';
import { METRICS, CATEGORIES, formatMetricValue, MetricDef } from '@/lib/metrics';
import { scoreToColor, TIER_RADIUS } from './color';
import type { MapPoint } from './MetricMapCanvas';

// Leaflet can't server-render — load the canvas only in the browser.
const MetricMapCanvas = dynamic(() => import('./MetricMapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="urbindex-map map-skeleton">
      <Loader2 size={28} className="analytics-spinner" />
      <span>Loading map…</span>
    </div>
  ),
});

export default function MapExplorer() {
  const [rows, setRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState('overall_livability');

  useEffect(() => {
    fetchAllCityRows()
      .then(setRows)
      .catch((e) => setError(e.message || 'Failed to load city data'))
      .finally(() => setLoading(false));
  }, []);

  const metric: MetricDef = useMemo(
    () => METRICS.find(m => m.key === metricKey) ?? METRICS[0],
    [metricKey],
  );

  const scores = useMemo(
    () => percentileScores(rows, metric.key, metric.higherIsBetter),
    [rows, metric],
  );

  const points = useMemo<MapPoint[]>(() => {
    const out: MapPoint[] = [];
    for (const r of rows) {
      const lat = getNum(r.latitude), lng = getNum(r.longitude);
      const val = getNum(r[metric.key]);
      const score = scores.get(r.fips_code);
      if (lat === null || lng === null || val === null || score === undefined) continue;
      out.push({
        fips: r.fips_code, name: r.name, state_code: r.state_code, slug: r.slug,
        lat, lng,
        label: formatMetricValue(val, metric.format),
        color: scoreToColor(score),
        radius: TIER_RADIUS[r.city_class] ?? 4,
      });
    }
    return out;
  }, [rows, scores, metric]);

  if (error) {
    return <div className="analytics-loading"><p style={{ color: 'var(--color-danger)' }}>Error: {error}</p></div>;
  }

  return (
    <div>
      <div className="map-controls">
        <label className="map-metric-select">
          <span>Metric</span>
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

        <div className="map-legend">
          <span>Worse</span>
          <div className="map-legend-bar" />
          <span>Better</span>
        </div>

        <div className="map-count">
          {loading ? 'Loading…' : `${points.length.toLocaleString()} cities`}
        </div>
      </div>

      {metric.description && <p className="map-metric-desc">{metric.description}</p>}

      <MetricMapCanvas points={points} metricLabel={metric.label} />
    </div>
  );
}
