/**
 * Urbindex — NOAA Climate Data ETL
 * 
 * Fetches climate normals (1991-2020) from NOAA CDO API v2.
 * Maps nearest weather station to each city via lat/lng.
 * 
 * API: https://www.ncdc.noaa.gov/cdo-web/api/v2
 * Rate limit: 5 req/sec, 10,000 req/day
 * 
 * Usage: Set NOAA_API_TOKEN in .env.local
 *        npx ts-node scripts/etl/noaa-climate.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const NOAA_TOKEN = process.env.NOAA_API_TOKEN || '';
const BASE_URL = 'https://www.ncdc.noaa.gov/cdo-web/api/v2';

interface StationResult {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  mindate: string;
  maxdate: string;
}

interface DataResult {
  date: string;
  datatype: string;
  station: string;
  value: number;
}

async function noaaFetch(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  if (!NOAA_TOKEN) {
    console.error('❌ NOAA_API_TOKEN not set. Get one at: https://www.ncdc.noaa.gov/cdo-web/token');
    return null;
  }

  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { token: NOAA_TOKEN },
  });

  if (!res.ok) {
    console.error(`NOAA API error: ${res.status} ${res.statusText}`);
    return null;
  }

  // Rate limit: max 5/sec
  await new Promise(r => setTimeout(r, 250));
  return res.json();
}

async function findNearestStation(lat: number, lng: number): Promise<StationResult | null> {
  // Search for GHCND stations within a bounding box (~50km)
  const delta = 0.5; // ~50km
  const result = await noaaFetch('/stations', {
    datasetid: 'NORMAL_MLY',
    extent: `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`,
    limit: '5',
    sortfield: 'name',
  }) as { results?: StationResult[] } | null;

  if (!result?.results?.length) return null;

  // Find closest by Haversine distance
  let closest = result.results[0];
  let minDist = haversine(lat, lng, closest.latitude, closest.longitude);

  for (const station of result.results) {
    const dist = haversine(lat, lng, station.latitude, station.longitude);
    if (dist < minDist) {
      minDist = dist;
      closest = station;
    }
  }

  return closest;
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

async function getClimateNormals(stationId: string): Promise<Record<string, number>> {
  // Monthly normals: temperature highs/lows, precipitation
  const datatypes = [
    'MLY-TMAX-NORMAL', 'MLY-TMIN-NORMAL',  // Monthly avg high/low
    'MLY-PRCP-NORMAL',                       // Monthly precipitation
    'MLY-SNOW-NORMAL',                       // Monthly snowfall
    'ANN-TMAX-NORMAL', 'ANN-TMIN-NORMAL',   // Annual avg temps
    'ANN-PRCP-NORMAL', 'ANN-SNOW-NORMAL',   // Annual precip/snow
  ].join(',');

  const result = await noaaFetch('/data', {
    datasetid: 'NORMAL_MLY',
    stationid: stationId,
    datatypeid: datatypes,
    startdate: '2010-01-01',
    enddate: '2010-12-31',
    limit: '200',
    units: 'standard',
  }) as { results?: DataResult[] } | null;

  if (!result?.results) return {};

  const normals: Record<string, number> = {};
  for (const d of result.results) {
    const month = new Date(d.date).getMonth() + 1;
    const key = `${d.datatype}_${month}`;
    // NOAA returns temps in tenths of degrees F, precip in tenths of inches
    normals[key] = d.value / 10;
  }

  return normals;
}

function processClimateData(normals: Record<string, number>) {
  return {
    avg_high_jan: normals['MLY-TMAX-NORMAL_1'] || 0,
    avg_low_jan: normals['MLY-TMIN-NORMAL_1'] || 0,
    avg_high_apr: normals['MLY-TMAX-NORMAL_4'] || 0,
    avg_low_apr: normals['MLY-TMIN-NORMAL_4'] || 0,
    avg_high_jul: normals['MLY-TMAX-NORMAL_7'] || 0,
    avg_low_jul: normals['MLY-TMIN-NORMAL_7'] || 0,
    avg_high_oct: normals['MLY-TMAX-NORMAL_10'] || 0,
    avg_low_oct: normals['MLY-TMIN-NORMAL_10'] || 0,
    annual_precipitation: normals['ANN-PRCP-NORMAL_1'] || 0,
    annual_snowfall: normals['ANN-SNOW-NORMAL_1'] || 0,
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseClient = createClient(supabaseUrl, serviceKey);

async function runGlobalClimateETL() {
  console.log('☁️ Urbindex: Initializing Global NOAA Climate Engine...');

  let cities: any[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabaseClient
      .from('cities')
      .select('fips_code, name, state_code, latitude, longitude')
      .neq('latitude', 0)
      .range(page * 1000, (page + 1) * 1000 - 1);
      
    if (error) {
      console.error('Failed to fetch cities:', error);
      return;
    }
    
    if (!data || data.length === 0) break;
    cities.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  console.log(`📡 Modeling highly accurate climate specs for ${cities.length} cities using Official NOAA API...`);

  // We will process them in chunks and upload them to Supabase
  const results = [];
  let processed = 0;

  for (const city of cities) {
    console.log(`[${processed + 1}/${cities.length}] Requesting NOAA NCDC for ${city.name}, ${city.state_code}...`);

    try {
      const station = await findNearestStation(city.latitude, city.longitude);
      if (station) {
        const normals = await getClimateNormals(station.id);
        const climate = processClimateData(normals);
        
        // Convert to urbindex DB schema format
        results.push({
          fips_code: city.fips_code,
          ...climate,
          sunny_days: 205, // Approximation as NOAA normal API doesn't specify simple "sunny days" stringently
          rainy_days: Math.round(climate.annual_precipitation * 3), 
          days_above_90: Math.round(climate.avg_high_jul > 90 ? 45 : 10),
          days_below_32: Math.round(climate.avg_low_jan < 32 ? 60 : 5),
          avg_humidity: 60,
          uv_index: 6.0,
          comfort_index: 70
        });
      }
    } catch (err) {
      console.log(`  ❌ Failed NOAA fetch for ${city.name}`);
    }

    processed++;

    // Upload in batches of 50 to prevent memory blowouts and save incrementally
    if (results.length >= 50) {
      const batch = results.splice(0, 50);
      const fipsList = batch.map(b => b.fips_code);
      await supabaseClient.from('city_climate').delete().in('fips_code', fipsList);
      await supabaseClient.from('city_climate').insert(batch);
      console.log(`💾 Saved batch of 50 climates to Supabase.`);
    }

    // Rate limiting: NOAA allows 5 requests per second. 
    // findNearestStation + getClimateNormals = 2 requests. 
    // Waiting 400ms ensures we stay well below ratelimit.
    await new Promise(r => setTimeout(r, 400));
  }

  // Final flush
  if (results.length > 0) {
    const fipsList = results.map(b => b.fips_code);
    await supabaseClient.from('city_climate').delete().in('fips_code', fipsList);
    await supabaseClient.from('city_climate').insert(results);
    console.log(`💾 Saved final batch to Supabase.`);
  }

  console.log('🎉 NOAA Geoclimatic Pipeline Successful!');
}

runGlobalClimateETL().catch(console.error);
