/**
 * Compute population density from Census Gazetteer land area data
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('Computing population density from Gazetteer land area...\n');

  // 1. Parse Gazetteer file (tab-delimited)
  const gaz = fs.readFileSync(
    path.resolve(__dirname, '../../data/gazetteer/2023_Gaz_place_national.txt'), 'utf-8'
  );
  const lines = gaz.split('\n');
  const headers = lines[0].split('\t').map(h => h.trim());
  
  console.log('Headers:', headers.join(', '));
  
  const geoidIdx = headers.indexOf('GEOID');
  const alandSqmiIdx = headers.indexOf('ALAND_SQMI');
  const alandIdx = headers.indexOf('ALAND');
  
  console.log(`GEOID idx: ${geoidIdx}, ALAND_SQMI idx: ${alandSqmiIdx}, ALAND idx: ${alandIdx}`);

  // Build lookup: FIPS -> land area in square miles
  const landArea: Record<string, number> = {};
  
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split('\t').map(f => f.trim());
    if (!fields[geoidIdx]) continue;
    
    const fips = fields[geoidIdx];
    let area = 0;
    
    if (alandSqmiIdx >= 0) {
      area = parseFloat(fields[alandSqmiIdx]) || 0;
    } else if (alandIdx >= 0) {
      // Convert square meters to square miles
      area = (parseFloat(fields[alandIdx]) || 0) / 2589988.11;
    }
    
    if (area > 0) {
      landArea[fips] = area;
    }
  }

  console.log(`Loaded land area for ${Object.keys(landArea).length} places`);

  // 2. Fetch all cities + populations
  const cities: any[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('cities')
      .select('fips_code, population, name, state_code')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    cities.push(...data);
    page++;
  }
  console.log(`Loaded ${cities.length} cities`);

  // 3. Compute and update density
  let updated = 0, notFound = 0;

  for (const city of cities) {
    const area = landArea[city.fips_code];
    if (!area || !city.population) {
      notFound++;
      continue;
    }

    const density = Math.round(city.population / area);

    const { error } = await supabase.from('city_demographics')
      .update({ population_density: density })
      .eq('fips_code', city.fips_code);

    if (!error) updated++;
  }

  console.log(`\nUpdated density for ${updated} cities (${notFound} missing land area)`);

  // Debug some cities
  const debugCities = ['Chicago', 'Phoenix', 'Raleigh', 'Wailuku', 'New York'];
  for (const name of debugCities) {
    const city = cities.find(c => c.name === name);
    if (city) {
      const area = landArea[city.fips_code];
      if (area) {
        console.log(`  ${name}: pop=${city.population}, area=${area.toFixed(1)} sq mi, density=${Math.round(city.population / area)}/sq mi`);
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
