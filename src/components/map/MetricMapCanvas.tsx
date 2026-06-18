'use client';

// The actual Leaflet surface. Imported via next/dynamic with ssr:false from
// MapExplorer, because Leaflet touches `window` and can't be server-rendered.
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { getCityUrl } from '@/lib/utils';

export interface MapPoint {
  fips: string;
  name: string;
  state_code: string;
  slug: string;
  lat: number;
  lng: number;
  label: string;   // formatted metric value for the popup
  color: string;
  radius: number;
}

export default function MetricMapCanvas({ points, metricLabel }: { points: MapPoint[]; metricLabel: string }) {
  return (
    <MapContainer
      preferCanvas
      center={[39.5, -98.35]}
      zoom={4}
      minZoom={3}
      className="urbindex-map"
      scrollWheelZoom
    >
      <TileLayer
        url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png?v=2"
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        subdomains="abcd"
      />
      {points.map((p) => (
        <CircleMarker
          key={p.fips}
          center={[p.lat, p.lng]}
          radius={p.radius}
          pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.82, weight: 0.4, opacity: 0.85 }}
        >
          <Popup>
            <div className="map-popup">
              <strong>{p.name}, {p.state_code}</strong>
              <div className="map-popup-metric">{metricLabel}: <b>{p.label}</b></div>
              <a href={getCityUrl(p.state_code, p.slug)}>View full profile →</a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
