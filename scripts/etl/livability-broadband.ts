/**
 * Livability - Broadband Access ETL
 * 
 * Fetches B28002_001E (Total Households) and B28002_004E (Households with Broadband)
 * from the Census ACS API to update the `city_livability.broadband_pct` column.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { createClient } from '@supabase/supabase-js';

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const BASE_URL = 'https://api.census.gov/data/2022/acs/acs5';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

// State FIPS lookup
const STATE_FIPS: Record<string, string> = {
  'AL':'01','AK':'02','AZ':'04','AR':'05','CA':'06','CO':'08','CT':'09','DE':'10',
  'DC':'11','FL':'12','GA':'13','HI':'15','ID':'16','IL':'17','IN':'18','IA':'19',
  'KS':'20','KY':'21','LA':'22','ME':'23','MD':'24','MA':'25','MI':'26','MN':'27',
  'MS':'28','MO':'29','MT':'30','NE':'31','NV':'32','NH':'33','NJ':'34','NM':'35',
  'NY':'36','NC':'37','ND':'38','OH':'39','OK':'40','OR':'41','PA':'42','RI':'44',
  'SC':'45','SD':'46','TN':'47','TX':'48','UT':'49','VT':'50','VA':'51','WA':'53',
  'WV':'54','WI':'55','WY':'56',
};

function parseNum(val: string | undefined): number {
  if (!val || val === '' || val === 'null' || val.startsWith('-')) return 0;
  return parseInt(val) || 0;
}

async function main() {
  console.log('Fetching Broadband data from Census ACS...');

  // 1. Get all cities
  const cities: { fips_code: string; state_code: string; county_fips: string }[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, state_code, county_fips').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    cities.push(...data);
    page++;
  }
  
  const states = new Set(cities.map(c => c.state_code));
  const VARIABLES = 'B28002_001E,B28002_004E'; // Total HHs, Broadband HHs

  let updated = 0, noData = 0, fallback = 0;

  for (const state of states) {
    const sf = STATE_FIPS[state];
    if (!sf) continue;
    
    process.stdout.write(`  [${state}] fetching... `);

    // Fetch place-level data
    const placeMap = new Map<string, number>();
    try {
      const url = `${BASE_URL}?get=${VARIABLES}&for=place:*&in=state:${sf}&key=${CENSUS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: string[][] = await res.json();
        const headers = data[0];
        const h001 = headers.indexOf('B28002_001E');
        const h004 = headers.indexOf('B28002_004E');
        const hPlace = headers.indexOf('place');

        for (let i = 1; i < data.length; i++) {
          const total = parseNum(data[i][h001]);
          const bb = parseNum(data[i][h004]);
          if (total > 0) {
            const pct = Math.round((bb / total) * 1000) / 10;
            placeMap.set(`${sf}${data[i][hPlace]}`, pct);
          }
        }
      }
    } catch {}

    // Fetch county-level fallback
    const countyMap = new Map<string, number>();
    try {
      const url = `${BASE_URL}?get=${VARIABLES}&for=county:*&in=state:${sf}&key=${CENSUS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: string[][] = await res.json();
        const headers = data[0];
        for (let i = 1; i < data.length; i++) {
          const total = parseNum(data[i][headers.indexOf('B28002_001E')]);
          const bb = parseNum(data[i][headers.indexOf('B28002_004E')]);
          if (total > 0) {
            const pct = Math.round((bb / total) * 1000) / 10;
            countyMap.set(`${sf}${data[i][headers.indexOf('county')]}`, pct);
          }
        }
      }
    } catch {}

    // Update cities
    const stateCities = cities.filter(c => c.state_code === state);
    for (const city of stateCities) {
      let pct = placeMap.get(city.fips_code);
      let usedFallback = false;

      if (pct === undefined && city.county_fips) {
        pct = countyMap.get(city.county_fips);
        if (pct !== undefined) usedFallback = true;
      }

      if (pct !== undefined) {
        const { error } = await supabase.from('city_livability')
          .update({ broadband_pct: pct })
          .eq('fips_code', city.fips_code);
          
        if (!error) {
          updated++;
          if (usedFallback) fallback++;
        }
      } else {
        noData++;
      }
    }

    console.log(`done. (matched: ${placeMap.size})`);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nCompleted: ${updated} cities updated (${fallback} from county fallback). Missing: ${noData}`);
}

main().catch(console.error);
