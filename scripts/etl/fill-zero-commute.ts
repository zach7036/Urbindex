/**
 * Fill missing commute data for cities with 0 commute_time_avg
 * Uses direct queries to avoid array missing bugs
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

async function main() {
  console.log('Fetching missing commute data directly...');

  // 1. Get ALL FIPS codes with 0 commute explicitly from city_livability
  const missingDb: string[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('city_livability').select('fips_code').eq('commute_time_avg', 0).range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    data.forEach(r => missingDb.push(r.fips_code));
    page++;
  }

  console.log(`Missing commute data for ${missingDb.length} cities.`);

  // Group by state FIPS (first 2 characters of fips_code)
  const byState = new Map<string, string[]>();
  for (const fips of missingDb) {
    const sf = fips.substring(0, 2);
    if (!byState.has(sf)) byState.set(sf, []);
    byState.get(sf)!.push(fips);
  }

  const VARIABLES = 'B08301_001E,B08301_003E,B08301_004E,B08301_010E,B08301_019E,B08301_021E,B08136_001E';

  let updatedCount = 0;

  for (const [sf, fipsList] of byState.entries()) {
    process.stdout.write(`  [State ${sf}] pulling... `);

    // Grab the entire state place data at once
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
    } catch(e) { console.error('Fetch error for state', sf, e); }

    let stateUpdatedCount = 0;

    for (const fips of fipsList) {
      let d = placeData.get(fips);

      if (d && d.totalCommuters > 0) {
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
