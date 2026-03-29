/**
 * Fix 0 commute times using the Census Data Profile DP03_0025E
 * (Mean travel time to work), which is not suppressed like the aggregate variable.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const BASE_URL = 'https://api.census.gov/data/2022/acs/acs5/profile';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function parseNum(val: string | undefined): number {
  if (!val || val === '' || val === 'null' || val.startsWith('-')) return 0;
  return parseFloat(val) || 0;
}

async function main() {
  console.log('Fetching Mean Travel Time to Work (DP03_0025E) from Census Profile API...');

  const missingDb: string[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('city_livability').select('fips_code').eq('commute_time_avg', 0).range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    data.forEach(r => missingDb.push(r.fips_code));
    page++;
  }

  console.log(`Missing commute data for ${missingDb.length} cities.`);

  const byState = new Map<string, string[]>();
  for (const fips of missingDb) {
    const sf = fips.substring(0, 2);
    if (!byState.has(sf)) byState.set(sf, []);
    byState.get(sf)!.push(fips);
  }

  const VARIABLES = 'DP03_0025E';
  let updatedCount = 0;

  for (const [sf, fipsList] of byState.entries()) {
    process.stdout.write(`  [State ${sf}] pulling... `);

    const placeData = new Map<string, number>();
    try {
      const url = `${BASE_URL}?get=${VARIABLES}&for=place:*&in=state:${sf}&key=${CENSUS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: string[][] = await res.json();
        const headers = data[0];
        const hPlace = headers.indexOf('place');

        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const commuteTime = parseNum(row[headers.indexOf('DP03_0025E')]);
          if (commuteTime > 0) {
            placeData.set(`${sf}${row[hPlace]}`, commuteTime);
          }
        }
      }
    } catch(e) { console.error('Fetch error for state', sf, e); }

    let stateUpdatedCount = 0;

    for (const fips of fipsList) {
      const avg = placeData.get(fips);

      if (avg && avg > 0) {
        await supabase.from('city_livability')
          .update({ commute_time_avg: avg })
          .eq('fips_code', fips);
        
        stateUpdatedCount++;
        updatedCount++;
      }
    }
    
    console.log(`done. Updated ${stateUpdatedCount}/${fipsList.length} cities.`);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nCompleted. Updated commute data for ${updatedCount}/${missingDb.length} cities.`);
}

main().catch(console.error);
