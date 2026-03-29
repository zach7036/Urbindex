import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function checkDatabase() {
  console.log('🔍 Checking Supabase Database Verification...');
  
  // 1. Check total count
  const { count, error } = await supabase
    .from('cities')
    .select('*', { count: 'exact', head: true });
    
  if (error) {
    console.error('Error fetching count:', error);
    return;
  }
  console.log(`\nTotal Cities in DB: ${count}`);

  // 2. Check for missing relations in other tables
  const tables = ['city_demographics', 'city_economy', 'city_housing', 'city_education', 'city_livability'];
  for (const table of tables) {
    const { count: tableCount } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    console.log(`Total ${table} in DB: ${tableCount}`);
  }

  // 3. Let's see the top 5 cities just to verify data looks good
  console.log('\nTop 5 Largest Cities:');
  const { data: topCities } = await supabase
    .from('cities')
    .select('name, state_code, population, fips_code')
    .order('population', { ascending: false })
    .limit(5);
    
  console.table(topCities);

  // 4. Let's find cities with null slugs or weird names
  const { data: weirdCities } = await supabase
    .from('cities')
    .select('name, slug, state_code')
    .or('slug.is.null,slug.eq.,name.ilike.%null%');
    
  if (weirdCities && weirdCities.length > 0) {
    console.log('\nCities with weird slugs or names:');
    console.table(weirdCities);
  } else {
    console.log('\nNo weird slugs or names found.');
  }
}

checkDatabase().catch(console.error);
