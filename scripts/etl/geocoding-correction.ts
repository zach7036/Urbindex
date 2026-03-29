import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TRACKING_FILE = path.join(__dirname, 'geocoded_cities.json');

async function geocodeCity(name: string, state_code: string) {
  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(name)}&state=${encodeURIComponent(state_code)}&country=USA&format=json&limit=1`;
  
  const headers = {
    'User-Agent': 'Urbindex-Data-Pipeline/1.0 (contact@urbindex.com)' // required for Nominatim
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        if (resp.status === 429) {
          console.log(' [Rate limited. Waiting 10s]');
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.log(` [Invalid JSON from API]`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      
      if (!data || data.length === 0) {
        return null; // Fallback, could not be found
      }

      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    } catch (err: any) {
      console.log(` [Error fetching: ${err.message}. Waiting 5s]`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return null;
}

async function main() {
  console.log('Starting Universal Geocoding Downtown Correction Tool...');
  
  // 1. Get all cities from Supabase
  const cities: any[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('cities').select('fips_code, name, state_code, population, latitude, longitude').range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    cities.push(...data);
    page++;
  }
  
  cities.sort((a, b) => (b.population || 0) - (a.population || 0));

  // 2. Load Progress Tracking File
  let completed = new Set<string>();
  if (fs.existsSync(TRACKING_FILE)) {
    const raw = fs.readFileSync(TRACKING_FILE, 'utf8');
    const arr = JSON.parse(raw);
    completed = new Set(arr);
  }

  const toProcess = cities.filter(c => !completed.has(c.fips_code));
  console.log(`${completed.size} cities already correctly geocoded. ${toProcess.length} remaining...`);

  let updatedCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const city = toProcess[i];
    process.stdout.write(`[${i+1}/${toProcess.length}] Fixing ${city.name}, ${city.state_code}... `);

    const coords = await geocodeCity(city.name, city.state_code);
    
    if (coords) {
      // Calculate how far the coordinate moved (approx distance trick)
      const latDiff = Math.abs(coords.lat - city.latitude);
      const lonDiff = Math.abs(coords.lon - city.longitude);
      const dist = Math.sqrt(latDiff*latDiff + lonDiff*lonDiff) * 69; // rough miles

      const { error } = await supabase
        .from('cities')
        .update({
          latitude: coords.lat,
          longitude: coords.lon
        })
        .eq('fips_code', city.fips_code);

      if (error) {
        console.log(`[Supabase Error: ${error.message}]`);
      } else {
        console.log(`Moved ${dist.toFixed(2)} miles. (Lat: ${coords.lat.toFixed(4)}, Lng: ${coords.lon.toFixed(4)})`);
        completed.add(city.fips_code);
        updatedCount++;
        fs.writeFileSync(TRACKING_FILE, JSON.stringify(Array.from(completed)));
      }
    } else {
      console.log(`[Warning: Nominatim could not find city exact match. Falling back to original]`);
      // Add it anyway so we don't infinitely retry failed lookups
      completed.add(city.fips_code);
      fs.writeFileSync(TRACKING_FILE, JSON.stringify(Array.from(completed)));
    }

    // STRICT 1 REQUEST PER SECOND API LIMIT BY NOMINATIM POLICIES
    await new Promise(r => setTimeout(r, 1100));
  }

  console.log(`\nCompletely finished correcting ${updatedCount} coordinates.`);
}

main().catch(console.error);
