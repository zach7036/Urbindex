import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';
import * as fs from 'fs';
import * as path from 'path';

interface StationData {
  lat: number;
  lng: number;
  precip: number | null;
  snow: number | null;
  days_above_90: number | null;
  days_below_32: number | null;
  rainy_days: number | null;
}

/** Properly parse CSV handling quoted commas */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function safeFloat(val: string): number | null {
  if (!val || val.trim() === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function ingestNOAA() {
  const supabase = createServiceClient();
  console.log('Ingesting NOAA 1991-2020 Climate Normals (fixed parser)...');

  const dataDir = path.resolve(__dirname, '../../data/noaa-climate');
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv') && f.startsWith('US'));
  console.log(`Found ${files.length} US station files.`);

  const stations: StationData[] = [];
  let debugged = false;

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      if (lines.length < 2) continue;

      const headers = parseCSVLine(lines[0]);
      const values = parseCSVLine(lines[1]);

      const lat = safeFloat(values[1]);
      const lng = safeFloat(values[2]);
      if (!lat || !lng) continue;

      const getVal = (colName: string): number | null => {
        const idx = headers.indexOf(colName);
        if (idx < 0) return null;
        return safeFloat(values[idx]);
      };

      const station: StationData = {
        lat, lng,
        precip: getVal('ANN-PRCP-NORMAL'),
        snow: getVal('ANN-SNOW-NORMAL'),
        days_above_90: getVal('ANN-TMAX-AVGNDS-GRTH090'),
        days_below_32: getVal('ANN-TMIN-AVGNDS-LSTH032'),
        rainy_days: getVal('ANN-PRCP-AVGNDS-GE010HI'),
      };

      // Debug: print Asheville to verify fix
      if (file === 'USW00003812.csv' && !debugged) {
        console.log(`[DEBUG] Asheville: d32=${station.days_below_32}, d90=${station.days_above_90}, snow=${station.snow}, precip=${station.precip}, rainy=${station.rainy_days}`);
        debugged = true;
      }

      stations.push(station);
    } catch { /* skip */ }
  }

  console.log(`Parsed ${stations.length} stations.`);

  const precipStations = stations.filter(s => s.precip !== null);
  const snowStations = stations.filter(s => s.snow !== null);
  const daysStations = stations.filter(s => s.days_above_90 !== null && s.days_below_32 !== null);
  const rainyStations = stations.filter(s => s.rainy_days !== null);

  console.log(`Precip: ${precipStations.length}, Snow: ${snowStations.length}, Days: ${daysStations.length}, Rainy: ${rainyStations.length}`);

  // Fetch cities
  const cities: any[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, latitude, longitude, name, state_code')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    cities.push(...data);
    page++;
  }
  console.log(`Loaded ${cities.length} cities.`);

  function findNearest<T extends { lat: number; lng: number }>(
    cityLat: number, cityLng: number, pool: T[]
  ): { station: T; dist: number } | null {
    let best: T | null = null;
    let bestDist = Infinity;
    for (const s of pool) {
      const d = haversine(cityLat, cityLng, s.lat, s.lng);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return best ? { station: best, dist: bestDist } : null;
  }

  const updates: any[] = [];

  for (const city of cities) {
    if (!city.latitude || !city.longitude) continue;

    const update: any = { fips_code: city.fips_code };

    const pMatch = findNearest(city.latitude, city.longitude, precipStations);
    if (pMatch && pMatch.dist < 200) {
      update.annual_precipitation = pMatch.station.precip;
    }

    const sMatch = findNearest(city.latitude, city.longitude, snowStations);
    if (sMatch && sMatch.dist < 200) {
      update.annual_snowfall = sMatch.station.snow;
    }

    const dMatch = findNearest(city.latitude, city.longitude, daysStations);
    if (dMatch && dMatch.dist < 200) {
      update.days_above_90 = Math.round(dMatch.station.days_above_90!);
      update.days_below_32 = Math.round(dMatch.station.days_below_32!);
    }

    const rMatch = findNearest(city.latitude, city.longitude, rainyStations);
    if (rMatch && rMatch.dist < 200) {
      update.rainy_days = Math.round(rMatch.station.rainy_days!);
      update.sunny_days = Math.max(100, Math.min(320, Math.round(365 - rMatch.station.rainy_days! * 1.6)));
    }

    // Debug Wailuku
    if (city.name === 'Wailuku') {
      console.log(`[DEBUG] Wailuku: d32=${update.days_below_32}, d90=${update.days_above_90}, snow=${update.annual_snowfall}, precip=${update.annual_precipitation}`);
    }

    updates.push(update);
  }

  console.log(`Built ${updates.length} updates.`);

  for (let i = 0; i < updates.length; i += 200) {
    const batch = updates.slice(i, i + 200);
    await Promise.all(batch.map(b =>
      supabase.from('city_climate').update(b).eq('fips_code', b.fips_code)
    ));
    console.log(`Updated ${Math.min(i + 200, updates.length)} / ${updates.length}`);
  }

  console.log('NOAA Multi-Pass Bulk Ingestion Complete!');
}

ingestNOAA().catch(console.error);
