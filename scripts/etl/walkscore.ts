/**
 * Urbindex — WalkScore ETL
 * 
 * Fetches Walk Score, Transit Score, and Bike Score via the WalkScore API.
 * Free tier: 5,000 calls/day. We need ~1,500 cities = 1 day.
 * 
 * API: https://www.walkscore.com/professional/api.php
 * Attribution: Must display Walk Score® branding & link to WalkScore.com
 * 
 * Usage: Set WALKSCORE_API_KEY in .env.local
 *        npx ts-node scripts/etl/walkscore.ts
 */

const WS_API_KEY = process.env.WALKSCORE_API_KEY || '';
const BASE_URL = 'https://api.walkscore.com/score';

interface WalkScoreResponse {
  status: number;
  walkscore: number;
  description: string;
  updated: string;
  logo_url: string;
  more_info_icon: string;
  more_info_link: string;
  ws_link: string;
  help_link: string;
  snapped_lat: number;
  snapped_lon: number;
  transit?: {
    score: number;
    description: string;
    summary: string;
  };
  bike?: {
    score: number;
    description: string;
  };
}

async function fetchWalkScore(
  lat: number,
  lng: number,
  address: string
): Promise<WalkScoreResponse | null> {
  if (!WS_API_KEY) {
    console.error('❌ WALKSCORE_API_KEY not set. Get one at: https://www.walkscore.com/professional/api.php');
    return null;
  }

  const params = new URLSearchParams({
    format: 'json',
    lat: lat.toString(),
    lon: lng.toString(),
    address: address,
    transit: '1',
    bike: '1',
    wsapikey: WS_API_KEY,
  });

  const url = `${BASE_URL}?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`WalkScore API error: ${res.status}`);
      return null;
    }

    const data = await res.json() as WalkScoreResponse;

    if (data.status !== 1) {
      console.error(`WalkScore status ${data.status} — score not available`);
      return null;
    }

    // Respect rate limits: ~3 calls/sec is safe for 5K/day
    await new Promise(r => setTimeout(r, 350));
    return data;
  } catch (error) {
    console.error('WalkScore fetch failed:', error);
    return null;
  }
}

interface CityInput {
  fips_code: string;
  name: string;
  state_code: string;
  state: string;
  latitude: number;
  longitude: number;
}

interface WalkScoreResult {
  walkscore: number;
  transit_score: number;
  bike_score: number;
  walk_description: string;
  transit_description: string;
  bike_description: string;
  // Attribution links (required by TOS)
  ws_link: string;
  logo_url: string;
  help_link: string;
}

async function runWalkScoreETL(cities: CityInput[]) {
  console.log('🚶 Urbindex WalkScore ETL');
  console.log('=========================');
  console.log(`Processing ${cities.length} cities...`);
  console.log(`⏱️  Estimated time: ~${Math.ceil(cities.length * 0.4 / 60)} minutes\n`);

  if (cities.length > 4500) {
    console.warn('⚠️  Warning: Free tier limit is 5,000 calls/day.');
    console.warn('   Consider splitting across multiple days.\n');
  }

  const results: Record<string, WalkScoreResult> = {};
  let processed = 0;
  let failed = 0;

  for (const city of cities) {
    const address = `${city.name}, ${city.state_code}`;
    console.log(`[${processed + 1}/${cities.length}] ${address}...`);

    const data = await fetchWalkScore(city.latitude, city.longitude, address);

    if (data) {
      results[city.fips_code] = {
        walkscore: data.walkscore,
        transit_score: data.transit?.score || 0,
        bike_score: data.bike?.score || 0,
        walk_description: data.description,
        transit_description: data.transit?.description || 'Minimal Transit',
        bike_description: data.bike?.description || 'Minimal Bike Infrastructure',
        ws_link: data.ws_link,
        logo_url: data.logo_url,
        help_link: data.help_link,
      };

      console.log(`  ✅ Walk: ${data.walkscore} | Transit: ${data.transit?.score || '—'} | Bike: ${data.bike?.score || '—'}`);
      processed++;
    } else {
      console.log(`  ⚠️  Failed`);
      failed++;
    }
  }

  console.log(`\n📊 WalkScore ETL Complete:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`\n⚠️  ATTRIBUTION REMINDER:`);
  console.log(`   Walk Score® is a registered trademark.`);
  console.log(`   You MUST display the WalkScore logo and link to walkscore.com`);
  console.log(`   wherever scores are displayed. See: https://www.walkscore.com/professional/branding.php`);

  return results;
}

export { runWalkScoreETL };

if (require.main === module) {
  const demoCities: CityInput[] = [
    { fips_code: '3755000', name: 'Raleigh', state_code: 'NC', state: 'North Carolina', latitude: 35.7796, longitude: -78.6382 },
  ];
  runWalkScoreETL(demoCities).catch(console.error);
}
