import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

const CENSUS_API_KEY = process.env.CENSUS_API_KEY;
if (!CENSUS_API_KEY) {
  throw new Error('Missing CENSUS_API_KEY in .env.local');
}

// 2021 ACS Data
const URL = `https://api.census.gov/data/2021/acs/acs5?get=NAME,B01003_001E,B25077_001E&for=place:*&in=state:*&key=${CENSUS_API_KEY}`;

async function computeAuthenticGrowth() {
  const supabase = createServiceClient();
  console.log('Authenticating w/ Federal Census API (2021 ACS 5-Year)...');

  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error(`Federal API Error: ${res.statusText}`);
  }

  const json = await res.json();
  if (!Array.isArray(json) || json.length < 2) {
    throw new Error('Federal API returned invalid or empty data payload.');
  }

  // The first row is headers: ["NAME", "B01003_001E", "B25077_001E", "state", "place"]
  const headers = json[0];
  const popIdx = headers.indexOf('B01003_001E');
  const homeIdx = headers.indexOf('B25077_001E');
  const stateIdx = headers.indexOf('state');
  const placeIdx = headers.indexOf('place');

  console.log(`Successfully Downloaded 2021 records for ${json.length - 1} jurisdictions.`);

  // Build a fast lookup map for the authentic 2021 history
  const history2021 = new Map<string, { pop: number, home: number }>();
  for (let i = 1; i < json.length; i++) {
    const row = json[i];
    const fips = row[stateIdx] + row[placeIdx]; // 7-digit concatenation
    const pop = parseInt(row[popIdx], 10);
    const home = parseInt(row[homeIdx], 10);
    
    // Only map valid numeric authentic records
    if (!isNaN(pop) && pop > 0 && !isNaN(home) && home > 0) {
      history2021.set(fips, { pop, home });
    }
  }

  console.log(`Mapped ${history2021.size} perfectly intact 2021 baseline geometries.`);
  
  // 1. Fetch 2022 Demographics
  console.log('\nLoading 2022 Local Database Demographics...');
  const demRows = [];
  let dPage = 0;
  while (true) {
    const { data: dBatch } = await supabase.from('city_demographics').select('*').eq('year', 2022).range(dPage * 1000, (dPage + 1) * 1000 - 1);
    if (!dBatch || dBatch.length === 0) break;
    demRows.push(...dBatch);
    dPage++;
  }

  // Calculate Deltas for Demographics
  const demUpdates = [];
  for (const current of demRows) {
    const historic = history2021.get(current.fips_code);
    if (historic && historic.pop > 0 && current.total_population !== null && current.total_population > 0) {
      const delta = ((current.total_population - historic.pop) / historic.pop) * 100;
      const parsed = parseFloat(delta.toFixed(1));
      
      demUpdates.push({
        ...current,
        population_growth_rate: parsed
      });
    }
  }

  console.log(`Mathematically generated ${demUpdates.length} Authentic Population Growth Vectors.`);
  // Batch Update 500 at a time
  for (let i = 0; i < demUpdates.length; i += 500) {
    const batch = demUpdates.slice(i, i + 500);
    const { error } = await supabase.from('city_demographics').upsert(batch);
    if (error) console.error(`Error updating Demographics batch ${i}:`, error.message);
  }

  // 2. Fetch 2022 Housing
  console.log('\nLoading 2022 Local Database Housing...');
  const housRows = [];
  let hPage = 0;
  while (true) {
    const { data: hBatch } = await supabase.from('city_housing').select('*').eq('year', 2022).range(hPage * 1000, (hPage + 1) * 1000 - 1);
    if (!hBatch || hBatch.length === 0) break;
    housRows.push(...hBatch);
    hPage++;
  }

  // Calculate Deltas for Housing
  const housUpdates = [];
  for (const current of housRows) {
    const historic = history2021.get(current.fips_code);
    if (historic && historic.home > 0 && current.median_home_value !== null && current.median_home_value > 0) {
      const delta = ((current.median_home_value - historic.home) / historic.home) * 100;
      const parsed = parseFloat(delta.toFixed(1));
      
      housUpdates.push({
        ...current,
        yoy_appreciation: parsed
      });
    }
  }

  console.log(`Mathematically generated ${housUpdates.length} Authentic Real Estate YoY Vectors.`);
  // Batch Update 500 at a time
  for (let i = 0; i < housUpdates.length; i += 500) {
    const batch = housUpdates.slice(i, i + 500);
    const { error } = await supabase.from('city_housing').upsert(batch);
    if (error) console.error(`Error updating Housing batch ${i}:`, error.message);
  }

  console.log('\nFederal Census Update 100% Core Complete.');
}

computeAuthenticGrowth().catch(console.error);
