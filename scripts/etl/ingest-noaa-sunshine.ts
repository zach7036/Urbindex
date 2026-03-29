import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';
import * as path from 'path';

const XLSX = require('xlsx');

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Map state abbreviations to full names for matching
const STATE_MAP: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
  'DC': 'District of Columbia', 'PR': 'Puerto Rico', 'GU': 'Guam', 'VI': 'Virgin Islands',
  'AS': 'American Samoa', 'MP': 'Northern Mariana Islands', 'PW': 'Palau'
};

interface SunshineStation {
  name: string;
  stateAbbr: string;
  clearDays: number;
  partlyCloudyDays: number;
  cloudyDays: number;
}

async function ingestSunshine() {
  const supabase = createServiceClient();
  console.log('Ingesting NOAA Cloudiness / Sunny Days data...');

  const filePath = path.resolve(__dirname, '../../data/NOAA_Mean_Cloud_Cover_Days.xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Parse stations (skip header rows 0-2, data starts at row 3)
  const stations: SunshineStation[] = [];

  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 42) continue;

    const stationName = String(row[1] || '').trim();
    if (!stationName) continue;

    const clearDays = parseInt(row[39]);
    const pcDays = parseInt(row[40]);
    const cdDays = parseInt(row[41]);

    if (isNaN(clearDays)) continue;

    // Parse state from station name like "BIRMINGHAM AP,AL" or "BIRMINGHAM AP, AL"
    const parts = stationName.split(',');
    const stateAbbr = (parts[parts.length - 1] || '').trim();

    stations.push({
      name: parts[0].trim(),
      stateAbbr,
      clearDays,
      partlyCloudyDays: isNaN(pcDays) ? 0 : pcDays,
      cloudyDays: isNaN(cdDays) ? 0 : cdDays,
    });
  }

  console.log(`Parsed ${stations.length} sunshine stations.`);
  
  // Debug: show a few
  stations.slice(0, 5).forEach(s => console.log(`  ${s.name}, ${s.stateAbbr}: ${s.clearDays} clear, ${s.partlyCloudyDays} PC, ${s.cloudyDays} cloudy`));

  // Fetch all cities
  const cities: any[] = [];
  let page = 0;
  while (true) {
    const { data: batch } = await supabase.from('cities')
      .select('fips_code, latitude, longitude, name, state_code')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!batch || batch.length === 0) break;
    cities.push(...batch);
    page++;
  }
  console.log(`Loaded ${cities.length} cities.`);

  // Also fetch NOAA station coordinates from the bulk download to get lat/lng for matching
  // We'll use state-based matching + name similarity since the cloudiness PDF doesn't have coords
  const fs = require('fs');
  const noaaDir = path.resolve(__dirname, '../../data/noaa-climate');
  const noaaFiles = fs.readdirSync(noaaDir).filter((f: string) => f.endsWith('.csv') && f.startsWith('USW'));

  // Build a lookup of NOAA station IDs to coordinates
  interface StationCoord { id: string; lat: number; lng: number; name: string; }
  const stationCoords: StationCoord[] = [];

  for (const file of noaaFiles) {
    try {
      const content = fs.readFileSync(path.join(noaaDir, file), 'utf-8');
      const firstLine = content.split('\n')[1];
      if (!firstLine) continue;
      // Proper CSV parse for data line
      const fields: string[] = [];
      let cur = '', inQ = false;
      for (const ch of firstLine) {
        if (ch === '"') inQ = !inQ;
        else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      fields.push(cur.trim());

      const id = fields[0];
      const lat = parseFloat(fields[1]);
      const lng = parseFloat(fields[2]);
      const name = fields[4] || '';
      if (!isNaN(lat) && !isNaN(lng)) {
        stationCoords.push({ id, lat, lng, name });
      }
    } catch { }
  }

  console.log(`Loaded ${stationCoords.length} NOAA station coordinates.`);

  // Match sunshine stations to NOAA coords by name similarity
  interface SunshineWithCoords extends SunshineStation { lat: number; lng: number; }
  const stationsWithCoords: SunshineWithCoords[] = [];

  for (const ss of stations) {
    // Find best matching NOAA station by name
    const ssNameNorm = ss.name.toLowerCase().replace(/[^a-z]/g, '');
    let bestMatch: StationCoord | null = null;
    let bestScore = 0;

    for (const sc of stationCoords) {
      const scNameNorm = sc.name.toLowerCase().replace(/[^a-z]/g, '');
      // Check if the sunshine station name is a prefix of NOAA station name
      if (scNameNorm.includes(ssNameNorm) || ssNameNorm.includes(scNameNorm)) {
        const score = Math.min(ssNameNorm.length, scNameNorm.length);
        if (score > bestScore) { bestScore = score; bestMatch = sc; }
      }
    }

    if (bestMatch) {
      stationsWithCoords.push({ ...ss, lat: bestMatch.lat, lng: bestMatch.lng });
    }
  }

  console.log(`Matched ${stationsWithCoords.length} / ${stations.length} sunshine stations to coordinates.`);

  // For any unmatched, try to match to closest city in same state and use its coords
  const unmatchedStations = stations.filter(ss =>
    !stationsWithCoords.find(s => s.name === ss.name && s.stateAbbr === ss.stateAbbr)
  );

  for (const ss of unmatchedStations) {
    // Find a city in the same state
    const stateCode = ss.stateAbbr;
    const stateCities = cities.filter(c => c.state_code === stateCode);
    if (stateCities.length > 0) {
      // Use the first matching city's coords as an approximation
      const cityNameNorm = ss.name.toLowerCase().replace(/[^a-z]/g, '');
      let bestCity = stateCities[0];
      for (const c of stateCities) {
        if (c.name.toLowerCase().replace(/[^a-z]/g, '').includes(cityNameNorm)) {
          bestCity = c;
          break;
        }
      }
      stationsWithCoords.push({ ...ss, lat: bestCity.latitude, lng: bestCity.longitude });
    }
  }

  console.log(`Total sunshine stations with coords: ${stationsWithCoords.length}`);

  // Now match each city to its nearest sunshine station
  const updates: any[] = [];

  for (const city of cities) {
    if (!city.latitude || !city.longitude) continue;

    let nearest: SunshineWithCoords | null = null;
    let minDist = Infinity;

    for (const s of stationsWithCoords) {
      const d = haversine(city.latitude, city.longitude, s.lat, s.lng);
      if (d < minDist) { minDist = d; nearest = s; }
    }

    if (nearest) {
      updates.push({
        fips_code: city.fips_code,
        sunny_days: nearest.clearDays + nearest.partlyCloudyDays,
      });
    }
  }

  console.log(`Built ${updates.length} sunny day updates.`);

  // Debug a few cities
  const debugCities = ['Wailuku', 'Phoenix', 'Seattle', 'Miami', 'Raleigh'];
  for (const name of debugCities) {
    const u = updates.find(u => {
      const c = cities.find((c: any) => c.fips_code === u.fips_code);
      return c && c.name === name;
    });
    if (u) {
      const c = cities.find((c: any) => c.fips_code === u.fips_code);
      console.log(`  [DEBUG] ${c.name}, ${c.state_code}: ${u.sunny_days} clear days`);
    }
  }

  // Batch update
  for (let i = 0; i < updates.length; i += 200) {
    const batch = updates.slice(i, i + 200);
    await Promise.all(batch.map(b =>
      supabase.from('city_climate').update(b).eq('fips_code', b.fips_code)
    ));
    console.log(`Updated ${Math.min(i + 200, updates.length)} / ${updates.length}`);
  }

  console.log('NOAA Sunshine/Cloudiness Ingestion Complete!');
}

ingestSunshine().catch(console.error);
