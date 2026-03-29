/**
 * Script to clean up awkward US Census Bureau names in the database.
 * Replaces names like "Urban Honolulu" -> "Honolulu" and removes suffixes like "(balance)".
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('Cleaning up messy Census city names...');
  
  // 1. Get all cities
  const cities: { fips_code: string; name: string, slug: string }[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, name, slug').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    cities.push(...data);
    page++;
  }

  let updated = 0;

  for (const city of cities) {
    let cleanName = city.name;
    
    // Exact overrides
    if (cleanName === 'Urban Honolulu') cleanName = 'Honolulu';
    
    // Specific cleanup for composite (balance) cities
    if (cleanName.includes('Louisville/Jefferson County')) cleanName = 'Louisville';
    if (cleanName.includes('Nashville-Davidson')) cleanName = 'Nashville';
    if (cleanName.includes('Augusta-Richmond County')) cleanName = 'Augusta';
    if (cleanName.includes('Athens-Clarke County')) cleanName = 'Athens';
    if (cleanName.includes('Macon-Bibb County')) cleanName = 'Macon';
    if (cleanName.includes('Lexington-Fayette')) cleanName = 'Lexington';
    if (cleanName.includes('Winston-Salem')) cleanName = 'Winston-Salem'; // Winston-Salem is real, leave it alone
    
    // Generic cleanup
    cleanName = cleanName
      .replace(/ metropolitan government \(balance\)/g, '')
      .replace(/ metro government \(balance\)/g, '')
      .replace(/ consolidated government \(balance\)/g, '')
      .replace(/ unified government \(balance\)/g, '')
      .replace(/ city \(balance\)/g, '')
      .replace(/ \(balance\)/g, '');
      
    // Strip trailing whitespace
    cleanName = cleanName.trim();

    if (cleanName !== city.name) {
      console.log(`Renaming: "${city.name}" -> "${cleanName}"`);
      
      const newSlug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      
      const { error } = await supabase.from('cities')
        .update({ name: cleanName, slug: newSlug })
        .eq('fips_code', city.fips_code);
        
      if (!error) updated++;
      else console.error(`Failed to rename ${city.name}:`, error.message);
    }
  }

  console.log(`\nCompleted. Updated ${updated} weirdly-named cities!`);
}

main().catch(console.error);
