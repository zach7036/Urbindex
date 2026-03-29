/**
 * Urbindex — EPA AirNow ETL
 * 
 * Fetches Air Quality Index (AQI) data from EPA AirNow API.
 * Designed for batched execution to respect rate limits.
 * 
 * API: https://www.airnowapi.org/
 * Note: Not for bulk scraping — we batch 50 cities/run with delays.
 * 
 * Usage: Set AIRNOW_API_KEY in .env.local
 *        npx ts-node scripts/etl/epa-airquality.ts [--batch N]
 */

const AIRNOW_KEY = process.env.AIRNOW_API_KEY || '';
const BASE_URL = 'https://www.airnowapi.org/aq';
const BATCH_SIZE = 50;
const DELAY_MS = 2000; // 2 seconds between calls

interface AQIObservation {
  DateObserved: string;
  HourObserved: number;
  LocalTimeZone: string;
  ReportingArea: string;
  StateCode: string;
  Latitude: number;
  Longitude: number;
  ParameterName: string; // PM2.5, PM10, O3, etc.
  AQI: number;
  Category: {
    Number: number;
    Name: string;
  };
}

async function fetchCurrentAQI(lat: number, lng: number): Promise<AQIObservation[]> {
  if (!AIRNOW_KEY) {
    console.error('❌ AIRNOW_API_KEY not set. Get one at: https://www.airnowapi.org/');
    return [];
  }

  const url = `${BASE_URL}/observation/latLong/current/?format=application/json&latitude=${lat}&longitude=${lng}&distance=50&API_KEY=${AIRNOW_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`AirNow API error: ${res.status}`);
      return [];
    }
    return await res.json() as AQIObservation[];
  } catch (error) {
    console.error('AirNow fetch failed:', error);
    return [];
  }
}

async function fetchHistoricalAQI(zipCode: string, date: string): Promise<AQIObservation[]> {
  const url = `${BASE_URL}/observation/zipCode/historical/?format=application/json&zipCode=${zipCode}&date=${date}T00-0000&distance=50&API_KEY=${AIRNOW_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json() as AQIObservation[];
  } catch {
    return [];
  }
}

function computeAQIAverage(observations: AQIObservation[]): number {
  if (!observations.length) return 0;
  const aqiValues = observations.map(o => o.AQI).filter(v => v > 0);
  if (!aqiValues.length) return 0;
  return Math.round(aqiValues.reduce((a, b) => a + b, 0) / aqiValues.length);
}

interface CityInput {
  fips_code: string;
  name: string;
  state_code: string;
  latitude: number;
  longitude: number;
}

// Track progress for resumable batching
interface BatchProgress {
  lastProcessedIndex: number;
  results: Record<string, { aqi_avg: number; primary_pollutant: string }>;
}

async function runAirQualityETL(cities: CityInput[], batchNumber?: number) {
  console.log('🌬️  Urbindex EPA AirNow ETL');
  console.log('===========================');

  // Determine which cities to process in this batch
  let startIdx = 0;
  let endIdx = cities.length;

  if (batchNumber !== undefined) {
    startIdx = (batchNumber - 1) * BATCH_SIZE;
    endIdx = Math.min(startIdx + BATCH_SIZE, cities.length);
    console.log(`Batch ${batchNumber}: Processing cities ${startIdx + 1} to ${endIdx} of ${cities.length}\n`);
  } else {
    console.log(`Processing all ${cities.length} cities...\n`);
  }

  if (startIdx >= cities.length) {
    console.log('✅ All batches complete! No more cities to process.');
    return {};
  }

  const results: Record<string, { aqi_avg: number; primary_pollutant: string }> = {};
  let processed = 0;
  let failed = 0;

  for (let i = startIdx; i < endIdx; i++) {
    const city = cities[i];
    console.log(`[${i + 1}/${cities.length}] ${city.name}, ${city.state_code}...`);

    const observations = await fetchCurrentAQI(city.latitude, city.longitude);

    if (observations.length > 0) {
      const aqi = computeAQIAverage(observations);
      const primaryPollutant = observations[0]?.ParameterName || 'PM2.5';

      results[city.fips_code] = {
        aqi_avg: aqi,
        primary_pollutant: primaryPollutant,
      };

      console.log(`  ✅ AQI: ${aqi} (${primaryPollutant})`);
      processed++;
    } else {
      console.log(`  ⚠️  No data available`);
      failed++;
    }

    // Delay between calls
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n📊 AirNow ETL Batch Complete:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Failed: ${failed}`);

  if (endIdx < cities.length) {
    const nextBatch = (batchNumber || 1) + 1;
    console.log(`   Next: Run with --batch ${nextBatch} to continue`);
  } else {
    console.log(`   🎉 All cities processed!`);
  }

  return results;
}

export { runAirQualityETL };

if (require.main === module) {
  // Parse --batch flag
  const batchArg = process.argv.find(a => a.startsWith('--batch'));
  const batchNum = batchArg ? parseInt(process.argv[process.argv.indexOf(batchArg) + 1]) : undefined;

  const demoCities: CityInput[] = [
    { fips_code: '3755000', name: 'Raleigh', state_code: 'NC', latitude: 35.7796, longitude: -78.6382 },
  ];
  runAirQualityETL(demoCities, batchNum).catch(console.error);
}
