import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function computeHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const f1 = lat1 * Math.PI / 180;
  const f2 = lat2 * Math.PI / 180;
  const df = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function getAmenities(lat: number, lng: number): Promise<any> {
  const radius = 2000; // 2km (1.2 miles) to capture primary walk/bike/transit data efficiently
  const query = `
    [out:json][timeout:60];
    (
      nwr["amenity"~"restaurant|fast_food|cafe|school|hospital|clinic|pharmacy|bank|atm|bicycle_rental|bicycle_parking|college|university|doctors|dentist"](around:${radius}, ${lat}, ${lng});
      nwr["shop"~"supermarket|convenience|grocery|clothes|books|electronics"](around:${radius}, ${lat}, ${lng});
      nwr["leisure"~"park|playground|garden"](around:${radius}, ${lat}, ${lng});
      nwr["highway"="bus_stop"](around:${radius}, ${lat}, ${lng});
      nwr["railway"~"station|subway_entrance|tram_stop"](around:${radius}, ${lat}, ${lng});
      way["cycleway"](around:${radius}, ${lat}, ${lng});
      way["highway"="cycleway"](around:${radius}, ${lat}, ${lng});
    );
    out center;
  `;

  let retries = 10;
  while (retries > 0) {
    try {
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });

      if (!res.ok) {
        if (res.status === 429) {
          process.stdout.write(' [Rate limit! waiting 60s to refill quota...]');
          await new Promise(r => setTimeout(r, 60000));
          retries--;
          continue;
        }
        throw new Error(`Overpass HTTP ${res.status}`);
      }

      return await res.json();
    } catch (e: any) {
      process.stdout.write(` [Err: ${e.message}]`);
      await new Promise(r => setTimeout(r, 10000));
      retries--;
    }
  }
  throw new Error("API completely exhausted retries. Halting to avoid false 0 scores.");
}

function computeDecay(distMeters: number, maxDist: number = 1600): number {
  if (distMeters <= 400) return 1.0; // 0.25 miles = full weight
  if (distMeters > maxDist) return 0.0;
  // Linear decay from 400m to 1600m
  return 1 - ((distMeters - 400) / (maxDist - 400));
}

async function main() {
  console.log('Calculating Walkability, Transit, & Bike via Overpass Single-Pass...\n');

  // Load cities
  const cities: any[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, name, state_code, latitude, longitude, population').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    cities.push(...data);
    page++;
  }

  // Load livability to see what's done
  const existingScores = new Set<string>();
  page = 0;
  while (true) {
    const { data } = await supabase.from('city_livability').select('fips_code, walkscore').gt('walkscore', 0).range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    data.forEach(r => existingScores.add(r.fips_code));
    page++;
  }

  let processing = cities.filter(c => !existingScores.has(c.fips_code) && c.latitude !== 0);
  
  // Sort by population descending so UI gets the most important cities quickly
  processing.sort((a, b) => (b.population || 0) - (a.population || 0));

  console.log(`Processing ${processing.length} missing cities out of ${cities.length} total.`);

  let updated = 0;

  for (let i = 0; i < processing.length; i++) {
    const city = processing[i];
    process.stdout.write(`[${i + 1}/${processing.length}] ${city.name}, ${city.state_code}... `);

    const start = Date.now();
    const data = await getAmenities(city.latitude, city.longitude);
    const elements = data.elements || [];
    
    // Categorize
    let cats = { grocery: 0, dining: 0, shopping: 0, edu: 0, health: 0, leisure: 0 };
    let transit = { bus: 0, rail: 0 };
    let bike = { lanes: 0, parking: 0 };
    
    // Exact counts for UI
    let exactParks = 0;
    let exactHospitals = 0;
    let exactGrocery = 0;

    for (const el of elements) {
      if (!el.tags) continue;
      
      const pLat = el.lat || el.center?.lat || city.latitude;
      const pLon = el.lon || el.center?.lon || city.longitude;
      const dist = computeHaversine(city.latitude, city.longitude, pLat, pLon);
      
      const type = el.tags;
      const decay = computeDecay(dist, 1600); // Walkability decay
      const bikeDecay = computeDecay(dist, 2500); // Bikes can go further
      const transitDecay = computeDecay(dist, 2000); // Transit catchment area

      // --- Walkability ---
      if (type.shop?.match(/supermarket|convenience|grocery/)) { cats.grocery += decay * 3; exactGrocery++; }
      else if (type.amenity?.match(/restaurant|fast_food|cafe/)) cats.dining += decay * 1;
      else if (type.shop?.match(/clothes|books|electronics/)) cats.shopping += decay * 0.5;
      else if (type.amenity?.match(/school|college|university/)) cats.edu += decay * 1;
      else if (type.amenity?.match(/hospital|clinic|pharmacy|doctors|dentist/)) { cats.health += decay * 1; if (type.amenity === 'hospital') exactHospitals++; }
      else if (type.leisure?.match(/park|playground|garden/)) { cats.leisure += decay * 1; exactParks++; }

      // --- Transit ---
      if (type.highway === 'bus_stop') transit.bus += transitDecay * 1;
      if (type.railway?.match(/station|subway_entrance|tram_stop/)) transit.rail += transitDecay * 4; // High weight for rail

      // --- Bikeability ---
      if (type.cycleway || (type.highway === 'cycleway')) bike.lanes += bikeDecay * 2;
      if (type.amenity === 'bicycle_parking' || type.amenity === 'bicycle_rental') bike.parking += bikeDecay * 0.5;
    }

    // Scoring Math (ideal targets for a 100 score)
    const walkRaw = Math.min(cats.grocery/15, 1) * 30 + Math.min(cats.dining/20, 1) * 20 + Math.min(cats.shopping/10, 1) * 10 + 
                    Math.min(cats.edu/5, 1) * 15 + Math.min(cats.leisure/8, 1) * 15 + Math.min(cats.health/5, 1) * 10;
    
    const transitRaw = Math.min(transit.bus/25, 1) * 40 + Math.min(transit.rail/5, 1) * 60;
    
    const bikeRaw = Math.min(bike.lanes/25, 1) * 70 + Math.min(bike.parking/15, 1) * 30;

    const wScore = Math.round(walkRaw);
    const tScore = Math.round(transitRaw);
    const bScore = Math.round(bikeRaw);

    // Per Capita Metrics
    const popBase = city.population || 10000;
    const parksPerc = Math.round((exactParks / (popBase / 10000)) * 10) / 10;
    const hospPerc = Math.round((exactHospitals / (popBase / 100000)) * 10) / 10;
    const grocPerc = Math.round((exactGrocery / (popBase / 10000)) * 10) / 10;

    const { error } = await supabase.from('city_livability')
      .update({
        walkscore: wScore,
        transit_score: tScore,
        bike_score: bScore,
        parks_per_capita: parksPerc,
        hospitals_per_capita: hospPerc,
        grocery_stores_per_capita: grocPerc
      })
      .eq('fips_code', city.fips_code);

    if (error) {
      console.log(`[Error Supabase: ${error.message}]`);
    } else {
      updated++;
      const timeMs = Date.now() - start;
      console.log(`nodes=${elements.length} | W:${wScore} T:${tScore} B:${bScore} | ${timeMs}ms`);
    }

    // Adaptive Delay for Overpass API Limits
    await new Promise(r => setTimeout(r, 60000));
  }

  console.log(`\nCompleted ${updated} cities!`);
}

main().catch(console.error);
