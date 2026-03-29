import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { createClient } from '@supabase/supabase-js';

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const BASE_URL = 'https://api.census.gov/data/2022/acs/acs5';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

// Just fix the two failed by patching their slugs and re-running the insert
const FAILED_CITIES = [
  { fips_code: '3675021', state_code: '36' }, // Tonawanda Town CDP, NY
  { fips_code: '0533482', state_code: '05' }  // Hot Springs Village CDP, AR
];

// Provide variables for just basic city info so we can insert a fallback
const VARS = 'NAME,B01003_001E';

async function fetchCensusData(variables: string, stateFips: string): Promise<string[][]> {
  const url = `${BASE_URL}?get=${variables}&for=place:*&in=state:${stateFips}${CENSUS_API_KEY ? `&key=${CENSUS_API_KEY}` : ''}`;
  console.log('Fetching', url);
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    return [];
  }
}

function parseNum(val: string | undefined): number {
  if (!val || val === '' || val === 'null' || val === '-666666666') return 0;
  return parseInt(val) || 0;
}

function slugify(text: string): string {
  // Keeping the word CDP this time!
  return text
    .toLowerCase()
    .replace(/\s+(city|town|village|borough|municipality),?\s*/gi, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCityClass(pop: number): string {
  if (pop >= 250000) return 'large';
  if (pop >= 100000) return 'mid';
  if (pop >= 50000) return 'small';
  return 'micro';
}

async function fixFailed() {
  console.log('🔧 Fixing the 2 missing cities...');

  for (const city of FAILED_CITIES) {
    // We only need the city's general info to insert into the cities table
    // Let's just do a direct fetch for that state
    const data = await fetchCensusData(VARS, city.state_code);
    if (data.length <= 1) continue;

    let targetRow: Record<string, string> | null = null;
    const headers = data[0];
    
    for (let i = 1; i < data.length; i++) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = data[i][idx]; });
        const placeFips = `${city.state_code}${row['place']}`;
        if (placeFips === city.fips_code) {
           targetRow = row;
           break;
        }
    }

    if (targetRow) {
        let name = targetRow['NAME'].replace(/,\s*.+$/, '');
        let stateCode = city.state_code === '36' ? 'NY' : 'AR';
        let stateName = city.state_code === '36' ? 'New York' : 'Arkansas';
        let pop = parseNum(targetRow['B01003_001E']);
        
        let customSlug = slugify(name);
        
        console.log(`Trying to insert: ${name} (${city.fips_code}), Pop: ${pop}, Slug: ${customSlug}`);

        const { error: cityErr } = await supabase.from('cities').upsert({
          fips_code: city.fips_code,
          name: name,
          state: stateName,
          state_code: stateCode,
          county: '',
          county_fips: '',
          latitude: 0,
          longitude: 0,
          population: pop,
          city_class: getCityClass(pop),
          slug: customSlug, // Includes 'cdp' because we modified the slugify regex above
          timezone: '',
        }, { onConflict: 'fips_code' });

        if (cityErr) {
            console.error(`❌ Still failed to insert ${name}:`, cityErr);
        } else {
            console.log(`✅ successfully inserted ${name}!`);
        }
    }
  }

  // Final check
  const { count } = await supabase.from('cities').select('*', { count: 'exact', head: true });
  console.log(`\n🎉 New total: ${count} / 4165`);
}

fixFailed().catch(console.error);
