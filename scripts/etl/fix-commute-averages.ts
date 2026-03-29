/**
 * Fix 0 commute times by falling back to county average commute time
 * for Census Designated Places where aggregate time is suppressed by the Census.
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

async function main() {
  console.log('Fetching county fallback commute times...');

  // 1. Get cities needing commute_time_avg fixing
  const targets: { fips_code: string; county_fips: string }[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('city_livability').select('fips_code').eq('commute_time_avg', 0).range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    data.forEach(r => targets.push({ fips_code: r.fips_code, county_fips: '' }));
    page++;
  }

  // Bind county_fips
  const allCities: any[] = [];
  page = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, state_code, county_fips').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allCities.push(...data);
    page++;
  }

  const cityMap = new Map(allCities.map(c => [c.fips_code, c]));
  
  for (const t of targets) {
    const info = cityMap.get(t.fips_code);
    if (info) t.county_fips = info.county_fips;
  }

  // Group targets by state for API fetching using fips_code!
  const byState = new Map<string, typeof targets>();
  for (const t of targets) {
    const sf = t.fips_code.substring(0, 2);
    if (!byState.has(sf)) byState.set(sf, []);
    byState.get(sf)!.push(t);
  }

  let updatedCount = 0;
  const VARIABLES = 'B08301_001E,B08136_001E';

  for (const [sf, cityList] of byState.entries()) {
    process.stdout.write(`  [State ${sf}] pulling county data... `);

    const countyAvg = new Map<string, number>();
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
          const aggTime = parseNum(row[headers.indexOf('B08136_001E')]);
          
          if (totalCommuters > 0 && aggTime > 0) {
            const avg = Math.round((aggTime / totalCommuters) * 10) / 10;
            // The Census API returns the 3-digit county code. Our DB stores the 5-digit code (State + County)
            countyAvg.set(`${sf}${row[hCounty]}`, avg);
          }
        }
      }
    } catch(e) { console.error('Error fetching state', sf, e); }

    let count = 0;
    for (const city of cityList) {
      const avg = countyAvg.get(city.county_fips);
      if (avg && avg > 0) {
        await supabase.from('city_livability')
          .update({ commute_time_avg: avg })
          .eq('fips_code', city.fips_code);
        count++;
        updatedCount++;
      }
    }
    
    console.log(`done. Fixed ${count}/${cityList.length} cities using county averages.`);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nCompleted. Fixed commute time for ${updatedCount}/${targets.length} cities.`);
}

main().catch(console.error);
