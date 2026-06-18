'use client';

// Leaflet surface for radius discovery. Loaded via next/dynamic (ssr:false).
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMapEvents, useMap } from 'react-leaflet';
import { getCityUrl } from '@/lib/utils';

export interface RadiusPoint {
  fips: string;
  name: string;
  state_code: string;
  slug: string;
  lat: number;
  lng: number;
  label: string;
  distance: number;
  color: string;
  radius: number;
}

interface Center { lat: number; lng: number }

// Lets users drop the anchor by clicking the map.
function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

// Pans/zooms only when an explicit "fly" is requested (picker / geolocation),
// not on every map click — clicking to move the anchor shouldn't jump the view.
function FlyTo({ center, token }: { center: Center | null; token: number }) {
  const map = useMap();
  useEffect(() => {
    if (center && token > 0) map.setView([center.lat, center.lng], Math.max(map.getZoom(), 7));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function RadiusMap({
  center, radiusMeters, points, onPick, flyToken,
}: {
  center: Center | null;
  radiusMeters: number;
  points: RadiusPoint[];
  onPick: (lat: number, lng: number) => void;
  flyToken: number;
}) {
  return (
    <MapContainer preferCanvas center={[39.5, -98.35]} zoom={4} minZoom={3} className="urbindex-map" scrollWheelZoom>
      <TileLayer
        url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png?v=2"
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        subdomains="abcd"
      />
      <ClickHandler onPick={onPick} />
      <FlyTo center={center} token={flyToken} />

      {center && (
        <Circle
          center={[center.lat, center.lng]}
          radius={radiusMeters}
          pathOptions={{ color: '#06d6a0', fillColor: '#06d6a0', fillOpacity: 0.06, weight: 1.5 }}
        />
      )}
      {center && (
        <CircleMarker
          center={[center.lat, center.lng]}
          radius={6}
          pathOptions={{ color: '#ffffff', fillColor: '#06d6a0', fillOpacity: 1, weight: 2 }}
        />
      )}

      {points.map((p) => (
        <CircleMarker
          key={p.fips}
          center={[p.lat, p.lng]}
          radius={p.radius}
          pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.85, weight: 0.4 }}
        >
          <Popup>
            <div className="map-popup">
              <strong>{p.name}, {p.state_code}</strong>
              <div className="map-popup-metric">{p.distance.toFixed(0)} mi away · {p.label}</div>
              <a href={getCityUrl(p.state_code, p.slug)}>View full profile →</a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
