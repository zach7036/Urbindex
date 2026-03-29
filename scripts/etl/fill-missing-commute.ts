/**
 * Fill missing commute data from Census ACS for cities with 0 commute_time_avg
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const BASE_URL = 'https://api.census.gov/data/2022/acs/acs5';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function parseNum(val: string | undefined): number {
  if (!val || val === '' || val === 'null' || val.startsWith('-')) return 0;
  return parseInt(val) || 0;
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10;
}

const STATE_FIPS: Record<string, string> = {
  'AL':'01','AK':'02','AZ':'04','AR':'05','CA':'06','CO':'08','CT':'09','DE':'10',
  'DC':'11','FL':'12','GA':'13','HI':'15','ID':'16','IL':'17','IN':'18','IA':'19',
  'KS':'20','KY':'21','LA':'22','ME':'23','MD':'24','MA':'25','MI':'26','MN':'27',
  'MS':'28','MO':'29','MT':'30','NE':'31','NV':'32','NH':'33','NJ':'34','NM':'35',
  'NY':'36','NC':'37','ND':'38','OH':'39','OK':'40','OR':'41','PA':'42','RI':'44',
  'SC':'45','SD':'46','TN':'47','TX':'48','UT':'49','VT':'50','VA':'51','WA':'53',
  'WV':'54','WI':'55','WY':'56',
};

async function main() {
  console.log('Fetching missing commute data...\n');

  // 1. Get cities needing commute data
  const cities: { fips_code: string; state_code: string; county_fips: string }[] = [];
  let page = 0;
  while (true) {
    // We need state_code to query API, and county_fips for fallbacks
    // But city_livability doesn't have state_code. So we query cities and filter locally.
    const { data } = await supabase.from('cities').select('fips_code, state_code, county_fips').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    cities.push(...data);
    page++;
  }

  const missingDb: string[] = [];
  page = 0;
  while (true) {
    const { data } = await supabase.from('city_livability').select('fips_code').eq('commute_time_avg', 0).range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    data.forEach(r => missingDb.push(r.fips_code));
    page++;
  }

  const missingSet = new Set(missingDb);
  const targetCities = cities.filter(c => missingSet.has(c.fips_code));
  console.log(`Missing commute data for ${targetCities.length} cities.`);

  const states = new Set(targetCities.map(c => c.state_code));

  // B08301_001E: Total commuters, B08301_003E: Drove alone, B08301_004E: Carpooled
  // B08301_010E: Transit, B08301_019E: Walked, B08301_021E: WFH
  // B08136_001E: Aggregate travel time
  const VARIABLES = 'B08301_001E,B08301_003E,B08301_004E,B08301_010E,B08301_019E,B08301_021E,B08136_001E';

  let updatedCount = 0;
  let fallbackCount = 0;

  for (const stateCode of states) {
    const sf = STATE_FIPS[stateCode];
    if (!sf) continue;
    
    process.stdout.write(`  [${stateCode}] fetching... `);

    // Place-level fetch
    const placeData = new Map<string, any>();
    try {
      const url = `${BASE_URL}?get=${VARIABLES}&for=place:*&in=state:${sf}&key=${CENSUS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: string[][] = await res.json();
        const headers = data[0];
        const hPlace = headers.indexOf('place');

        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const totalCommuters = parseNum(row[headers.indexOf('B08301_001E')]);
          if (totalCommuters > 0) {
            placeData.set(`${sf}${row[hPlace]}`, {
              droveAlone: parseNum(row[headers.indexOf('B08301_003E')]),
              carpooled: parseNum(row[headers.indexOf('B08301_004E')]),
              transit: parseNum(row[headers.indexOf('B08301_010E')]),
              walked: parseNum(row[headers.indexOf('B08301_019E')]),
              wfh: parseNum(row[headers.indexOf('B08301_021E')]),
              aggTime: parseNum(row[headers.indexOf('B08136_001E')]),
              totalCommuters
            });
          }
        }
      }
    } catch(e) { console.log('County Fetch ERror:', e); }

    // County-level fallback
    const countyData = new Map<string, any>();
    try {
      const url = `${BASE_URL}?get=${VARIABLES}&for=county:*&in=state:${sf}&key=${CENSUS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: string[][] = await res.json();
        const headers = data[0];
        const hCounty = headers.indexOf('county');

        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const totalCommuters = parseNum(row[headers.indexOf('B08301_001E')]);
          if (totalCommuters > 0) {
            countyData.set(`${sf}${row[hCounty]}`, {
              droveAlone: parseNum(row[headers.indexOf('B08301_003E')]),
              carpooled: parseNum(row[headers.indexOf('B08301_004E')]),
              transit: parseNum(row[headers.indexOf('B08301_010E')]),
              walked: parseNum(row[headers.indexOf('B08301_019E')]),
              wfh: parseNum(row[headers.indexOf('B08301_021E')]),
              aggTime: parseNum(row[headers.indexOf('B08136_001E')]),
              totalCommuters
            });
          }
        }
      }
    } catch(e) { console.log('County Fetch ERror:', e); }

    // Process cities in this state
    const stateCities = targetCities.filter(c => c.state_code === stateCode);
    console.log(`State ${stateCode} has ${stateCities.length} cities. Loaded ${placeData.size} places and ${countyData.size} counties.`);
    for (const city of stateCities) {
      let d = placeData.get(city.fips_code);
      let usedFallback = false;

      if (!d && city.county_fips) {
        d = countyData.get(city.county_fips);
        usedFallback = !!d;
      }

      if (d && d.totalCommuters > 0) {
        // ... update code ...
        const otherCommute = Math.max(0, d.totalCommuters - d.droveAlone - d.carpooled - d.transit - d.walked - d.wfh);
        const avgCommute = Math.round((d.aggTime / d.totalCommuters) * 10) / 10;
        
        await supabase.from('city_livability')
          .update({
            commute_time_avg: avgCommute,
            commute_mode: {
              drove_alone: pct(d.droveAlone, d.totalCommuters),
              carpooled: pct(d.carpooled, d.totalCommuters),
              public_transit: pct(d.transit, d.totalCommuters),
              walked: pct(d.walked, d.totalCommuters),
              worked_from_home: pct(d.wfh, d.totalCommuters),
              other: pct(otherCommute, d.totalCommuters)
            }
          })
          .eq('fips_code', city.fips_code);
        
        updatedCount++;
        if (usedFallback) fallbackCount++;
      }
    }
    
    console.log('done.');
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nCompleted. Updated commute data for ${updatedCount} cities (${fallbackCount} via county fallback).`);
}

main().catch(console.error);
