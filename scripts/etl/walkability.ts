/**
 * Urbindex — Custom Walkability Score ETL
 * 
 * Computes Walk, Transit, and Bike scores using OpenStreetMap data
 * via the free Overpass API. No API key required.
 * 
 * Methodology:
 *   Walk Score  = weighted POI density within 1km of city center
 *   Transit Score = transit stop density + route diversity
 *   Bike Score  = bike infrastructure (lanes, paths, parking)
 * 
 * Categories & weights (inspired by Walk Score methodology):
 *   Grocery:      3x  (supermarket, convenience)
 *   Restaurants:   0.75x (restaurant, cafe, fast_food)
 *   Shopping:     0.5x (retail shops)
 *   Coffee:       1x  (cafe)
 *   Schools:      1x  (school, university, college)
 *   Parks:        1x  (park, playground, garden)
 *   Culture:      1x  (cinema, theatre, library, museum)
 *   Healthcare:   1x  (hospital, clinic, pharmacy, dentist)
 *   Banking:      0.5x (bank, atm)
 * 
 * Overpass API: https://overpass-api.de/api/interpreter
 * Rate limit: ~2 req/sec on public server (generous for our needs)
 * 
 * Usage: npx ts-node scripts/etl/walkability.ts
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Scoring weights per category — higher = more important for walkability
const WALK_CATEGORIES: Record<string, { query: string; weight: number; idealCount: number }> = {
  grocery: {
    query: 'nwr["shop"~"supermarket|convenience|greengrocer|grocery"]',
    weight: 3,
    idealCount: 5,  // 5+ within walking distance = full score
  },
  restaurants: {
    query: 'nwr["amenity"~"restaurant|fast_food|food_court"]',
    weight: 0.75,
    idealCount: 15,
  },
  cafes: {
    query: 'nwr["amenity"="cafe"]',
    weight: 1,
    idealCount: 5,
  },
  shopping: {
    query: 'nwr["shop"]["shop"!~"supermarket|convenience|greengrocer|grocery|car|car_repair|car_parts"]',
    weight: 0.5,
    idealCount: 10,
  },
  schools: {
    query: 'nwr["amenity"~"school|university|college|kindergarten"]',
    weight: 1,
    idealCount: 3,
  },
  parks: {
    query: 'nwr["leisure"~"park|playground|garden|dog_park|nature_reserve"]',
    weight: 1,
    idealCount: 3,
  },
  culture: {
    query: 'nwr["amenity"~"cinema|theatre|library|arts_centre|community_centre|museum"]',
    weight: 1,
    idealCount: 2,
  },
  healthcare: {
    query: 'nwr["amenity"~"hospital|clinic|pharmacy|dentist|doctors"]',
    weight: 1,
    idealCount: 3,
  },
  banking: {
    query: 'nwr["amenity"~"bank|atm"]',
    weight: 0.5,
    idealCount: 2,
  },
};

// Transit categories
const TRANSIT_CATEGORIES: Record<string, { query: string; weight: number; idealCount: number }> = {
  bus_stops: {
    query: 'nwr["highway"="bus_stop"]',
    weight: 1,
    idealCount: 15,
  },
  train_stations: {
    query: 'nwr["railway"~"station|halt|tram_stop"]["railway"!="abandoned"]',
    weight: 3,
    idealCount: 2,
  },
  subway_entrances: {
    query: 'nwr["railway"="subway_entrance"]',
    weight: 4,
    idealCount: 2,
  },
  bus_routes: {
    query: 'relation["route"="bus"]',
    weight: 2,
    idealCount: 10,
  },
};

// Bike categories
const BIKE_CATEGORIES: Record<string, { query: string; weight: number; idealCount: number }> = {
  bike_lanes: {
    query: 'way["cycleway"~"lane|track|shared_lane"]',
    weight: 3,
    idealCount: 10,
  },
  bike_paths: {
    query: 'way["highway"="cycleway"]',
    weight: 2,
    idealCount: 5,
  },
  bike_parking: {
    query: 'nwr["amenity"="bicycle_parking"]',
    weight: 1,
    idealCount: 10,
  },
  bike_rental: {
    query: 'nwr["amenity"="bicycle_rental"]',
    weight: 1.5,
    idealCount: 3,
  },
};

async function queryOverpass(lat: number, lng: number, radiusMeters: number, query: string): Promise<number> {
  const overpassQuery = `
    [out:json][timeout:30];
    (
      ${query}(around:${radiusMeters},${lat},${lng});
    );
    out count;
  `;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });

    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited — wait and retry
        console.log('    ⏳ Rate limited, waiting 30s...');
        await new Promise(r => setTimeout(r, 30000));
        return queryOverpass(lat, lng, radiusMeters, query);
      }
      console.error(`    Overpass error: ${res.status}`);
      return 0;
    }

    const data = await res.json() as { elements: { tags: { total: string } }[] };
    const totalEl = data.elements?.[0];
    const count = parseInt(totalEl?.tags?.total || '0');
    return count;
  } catch (error) {
    console.error('    Overpass query failed:', error);
    return 0;
  }
}

function computeCategoryScore(
  categories: Record<string, { query: string; weight: number; idealCount: number }>,
  counts: Record<string, number>
): number {
  let totalWeight = 0;
  let weightedScore = 0;

  for (const [name, config] of Object.entries(categories)) {
    const count = counts[name] || 0;
    // Score is (actual / ideal), capped at 1.0
    const rawScore = Math.min(count / config.idealCount, 1.0);
    weightedScore += rawScore * config.weight;
    totalWeight += config.weight;
  }

  if (totalWeight === 0) return 0;
  // Normalize to 0-100 scale
  return Math.round((weightedScore / totalWeight) * 100);
}

interface CityInput {
  fips_code: string;
  name: string;
  state_code: string;
  latitude: number;
  longitude: number;
  population: number;
}

interface WalkabilityResult {
  walkscore: number;
  transit_score: number;
  bike_score: number;
  category_counts: Record<string, number>;
}

async function computeWalkability(city: CityInput): Promise<WalkabilityResult> {
  // Scale radius by city size: larger cities get slightly larger radius
  // since city "centers" are more spread out
  const radius = city.population > 500000 ? 1500 :
                 city.population > 100000 ? 1200 : 1000;

  const walkCounts: Record<string, number> = {};
  const transitCounts: Record<string, number> = {};
  const bikeCounts: Record<string, number> = {};

  // Query walk categories
  for (const [name, config] of Object.entries(WALK_CATEGORIES)) {
    process.stdout.write(`    ${name}...`);
    const count = await queryOverpass(city.latitude, city.longitude, radius, config.query);
    walkCounts[name] = count;
    process.stdout.write(` ${count}\n`);
    // Polite delay
    await new Promise(r => setTimeout(r, 1200));
  }

  // Query transit categories
  for (const [name, config] of Object.entries(TRANSIT_CATEGORIES)) {
    process.stdout.write(`    ${name}...`);
    const count = await queryOverpass(city.latitude, city.longitude, radius * 2, config.query);
    transitCounts[name] = count;
    process.stdout.write(` ${count}\n`);
    await new Promise(r => setTimeout(r, 1200));
  }

  // Query bike categories
  for (const [name, config] of Object.entries(BIKE_CATEGORIES)) {
    process.stdout.write(`    ${name}...`);
    const count = await queryOverpass(city.latitude, city.longitude, radius * 1.5, config.query);
    bikeCounts[name] = count;
    process.stdout.write(` ${count}\n`);
    await new Promise(r => setTimeout(r, 1200));
  }

  const walkscore = computeCategoryScore(WALK_CATEGORIES, walkCounts);
  const transit_score = computeCategoryScore(TRANSIT_CATEGORIES, transitCounts);
  const bike_score = computeCategoryScore(BIKE_CATEGORIES, bikeCounts);

  return {
    walkscore,
    transit_score,
    bike_score,
    category_counts: { ...walkCounts, ...transitCounts, ...bikeCounts },
  };
}

async function runWalkabilityETL() {
  console.log('🚶 Urbindex Custom Walkability ETL');
  console.log('===================================');
  console.log('Data source: OpenStreetMap (Overpass API) — No API key needed');

  console.log('🔍 Fetching cities needing livability data...');
  const { createClient } = require('@supabase/supabase-js');
  const dotenv = require('dotenv');
  const path = require('path');
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Get cities that exist in DB
  let allCities: CityInput[] = [];
  let hasMore = true;
  let page = 0;
  while(hasMore) {
    const { data: chunk } = await supabase
      .from('cities')
      .select('fips_code, name, state_code, latitude, longitude, population')
      .order('population', { ascending: false })
      .range(page * 1000, (page + 1) * 1000 - 1);
    
    if (chunk && chunk.length > 0) {
      allCities.push(...chunk);
      page++;
    } else {
      hasMore = false;
    }
  }

  // Find which ones already have livability data
  const { data: existing } = await supabase
    .from('city_livability')
    .select('fips_code, walk_score');

  const processedDeps = new Set(existing?.filter((r: any) => r.walk_score != null).map((r: any) => r.fips_code) || []);
  const citiesToProcess = allCities.filter(c => !processedDeps.has(c.fips_code));

  console.log(`📊 Found ${allCities.length} total cities.`);
  console.log(`⏭️  Skipping ${processedDeps.size} already processed.`);
  console.log(`🚀 Processing ${citiesToProcess.length} cities...`);
  console.log(`⏱️  ~${Math.ceil(citiesToProcess.length * 20 / 60)} minutes (17 queries per city × 1.2s delay)\n`);

  let processed = 0;

  for (const city of citiesToProcess) {
    console.log(`\n[${processed + 1}/${citiesToProcess.length}] ${city.name}, ${city.state_code} (pop: ${(city as any).population.toLocaleString()})`);

    const result = await computeWalkability(city);

    console.log(`  📊 Walk: ${result.walkscore} | Transit: ${result.transit_score} | Bike: ${result.bike_score}`);
    
    // Save to Supabase
    const { error } = await supabase.from('city_livability').upsert({
      fips_code: city.fips_code,
      walk_score: result.walkscore,
      transit_score: result.transit_score,
      bike_score: result.bike_score,
      // Default to 50 for the other attributes until we pull real data
      air_quality_index: 50,
      healthcare_access_score: 50,
      cultural_density_score: 50
    }, { onConflict: 'fips_code' });

    if (error) {
       console.error(`  ❌ Failed to save ${city.name}:`, error.message);
    } else {
       console.log(`  ✅ Saved ${city.name} to Supabase.`);
    }

    processed++;
    // Extra delay between cities
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n✅ Walkability ETL Complete: ${processed} cities processed`);
  console.log('ℹ️  Scores computed from OpenStreetMap POI density within walking radius');
  console.log('   No third-party API licensing required\n');
}

export { runWalkabilityETL, computeWalkability };

if (require.main === module) {
  runWalkabilityETL().catch(console.error);
}
