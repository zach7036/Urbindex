import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function getAllDbFips() {
  let allFips = new Set<string>();
  let hasMore = true;
  let page = 0;
  const pageSize = 1000;

  while (hasMore) {
    const { data: dbCities, error } = await supabase
      .from('cities')
      .select('fips_code')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
       console.error(error);
       break;
    }

    if (dbCities && dbCities.length > 0) {
      dbCities.forEach(c => allFips.add(c.fips_code));
      page++;
    } else {
      hasMore = false;
    }
  }
  return allFips;
}

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const BASE_URL = 'https://api.census.gov/data/2022/acs/acs5';
const STATE_INFO: Record<string, { code: string; name: string }> = {
  '01': { code: 'AL', name: 'Alabama' }, '02': { code: 'AK', name: 'Alaska' },
  '04': { code: 'AZ', name: 'Arizona' }, '05': { code: 'AR', name: 'Arkansas' },
  '06': { code: 'CA', name: 'California' }, '08': { code: 'CO', name: 'Colorado' },
  '09': { code: 'CT', name: 'Connecticut' }, '10': { code: 'DE', name: 'Delaware' },
  '11': { code: 'DC', name: 'District of Columbia' }, '12': { code: 'FL', name: 'Florida' },
  '13': { code: 'GA', name: 'Georgia' }, '15': { code: 'HI', name: 'Hawaii' },
  '16': { code: 'ID', name: 'Idaho' }, '17': { code: 'IL', name: 'Illinois' },
  '18': { code: 'IN', name: 'Indiana' }, '19': { code: 'IA', name: 'Iowa' },
  '20': { code: 'KS', name: 'Kansas' }, '21': { code: 'KY', name: 'Kentucky' },
  '22': { code: 'LA', name: 'Louisiana' }, '23': { code: 'ME', name: 'Maine' },
  '24': { code: 'MD', name: 'Maryland' }, '25': { code: 'MA', name: 'Massachusetts' },
  '26': { code: 'MI', name: 'Michigan' }, '27': { code: 'MN', name: 'Minnesota' },
  '28': { code: 'MS', name: 'Mississippi' }, '29': { code: 'MO', name: 'Missouri' },
  '30': { code: 'MT', name: 'Montana' }, '31': { code: 'NE', name: 'Nebraska' },
  '32': { code: 'NV', name: 'Nevada' }, '33': { code: 'NH', name: 'New Hampshire' },
  '34': { code: 'NJ', name: 'New Jersey' }, '35': { code: 'NM', name: 'New Mexico' },
  '36': { code: 'NY', name: 'New York' }, '37': { code: 'NC', name: 'North Carolina' },
  '38': { code: 'ND', name: 'North Dakota' }, '39': { code: 'OH', name: 'Ohio' },
  '40': { code: 'OK', name: 'Oklahoma' }, '41': { code: 'OR', name: 'Oregon' },
  '42': { code: 'PA', name: 'Pennsylvania' }, '44': { code: 'RI', name: 'Rhode Island' },
  '45': { code: 'SC', name: 'South Carolina' }, '46': { code: 'SD', name: 'South Dakota' },
  '47': { code: 'TN', name: 'Tennessee' }, '48': { code: 'TX', name: 'Texas' },
  '49': { code: 'UT', name: 'Utah' }, '50': { code: 'VT', name: 'Vermont' },
  '51': { code: 'VA', name: 'Virginia' }, '53': { code: 'WA', name: 'Washington' },
  '54': { code: 'WV', name: 'West Virginia' }, '55': { code: 'WI', name: 'Wisconsin' },
  '56': { code: 'WY', name: 'Wyoming' },
};

async function fetchCensusData(variables: string, stateFips: string): Promise<string[][]> {
  const url = `${BASE_URL}?get=${variables}&for=place:*&in=state:${stateFips}${CENSUS_API_KEY ? `&key=${CENSUS_API_KEY}` : ''}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    return [];
  }
}

async function findMissing() {
  const dbFips = await getAllDbFips();
  console.log(`Found ${dbFips.size} in DB.`);

  console.log('🔍 Re-fetching Census logic...');
  const censusFips = new Set<string>();
  const censusData: Record<string, string> = {};

  for (const [fips, info] of Object.entries(STATE_INFO)) {
    const data = await fetchCensusData('NAME,B01003_001E', fips);
    if (data.length <= 1) continue;
    
    const headers = data[0];
    for (let i = 1; i < data.length; i++) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = data[i][idx]; });
        const population = parseInt(row['B01003_001E']) || 0;
        if (population >= 10000) {
            const placeFips = `${fips}${row['place']}`;
            censusFips.add(placeFips);
            censusData[placeFips] = row['NAME'];
        }
    }
    await new Promise(r => setTimeout(r, 100));
  }

  const missing = [...censusFips].filter(x => !dbFips.has(x));
  console.log('\n❌ MISSING CITIES:');
  console.log(missing.map(fips => `${censusData[fips]} (FIPS: ${fips})`));
}

findMissing().catch(console.error);
