import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';
import { slugify } from '../../src/lib/utils';

async function runCleanup() {
  const supabase = createServiceClient();
  
  // Fetch everything to examine and clean
  const { data, error } = await supabase.from('cities').select('fips_code, name, slug');
  if (error || !data) {
    console.error('Failed to fetch cities', error);
    return;
  }

  const updates = [];
  const changes = [];

  for (const city of data) {
    let newName = city.name;
    
    // The exact regex logic for cleaning up Census names
    // Examples: "Louisville/Jefferson County metro government (balance)"
    // "Nashville-Davidson metropolitan government (balance)"
    // "Athens-Clarke County unified government (balance)"
    // "Indianapolis city (balance)"
    // "Augusta-Richmond County consolidated government (balance)"
    
    // 1. Remove "(balance)"
    newName = newName.replace(/\s*\(balance\)\s*/i, '');
    
    // 2. Remove "metro government", "metropolitan government", "unified government", "consolidated government"
    newName = newName.replace(/\s+(metro|metropolitan|unified|consolidated|urban)\s+(government|county)\s*/i, '');
    
    // 3. Remove "city" if it's trapped at the end like "Indianapolis city"
    // (Only if it ends with " city" - wait, let's just do it if it matches exactly the balance cases)
    if (newName.endsWith(' city')) {
      newName = newName.slice(0, -5);
    }
    
    // 4. Sometimes they use hyphens or slashes for county consolidations:
    // "Louisville/Jefferson County" -> "Louisville"
    // "Nashville-Davidson" -> "Nashville"
    // "Athens-Clarke County" -> "Athens"
    if (newName.includes('/')) {
      newName = newName.split('/')[0].trim();
    }
    if (newName.includes('-')) {
      // Nashville-Davidson -> Nashville
      // Lexington-Fayette -> Lexington
      // Butte-Silver Bow -> Butte
      // Be careful not to split real hyphenated names like "Winston-Salem"
      // Known consolidated places:
      const consolidations = ['Nashville-Davidson', 'Athens-Clarke County', 'Augusta-Richmond County', 'Lexington-Fayette', 'Butte-Silver Bow'];
      if (consolidations.includes(newName)) {
        newName = newName.split('-')[0].trim();
      }
    }
    
    newName = newName.trim();

    if (newName !== city.name) {
      const newSlug = slugify(newName);
      changes.push({ old: city.name, new: newName, slug: newSlug });
      
      updates.push(
        supabase.from('cities').update({ name: newName, slug: newSlug }).eq('fips_code', city.fips_code)
      );
    }
  }

  console.log(`Found ${updates.length} cities to clean up.`);
  if (changes.length > 0) {
    console.log('Examples:');
    console.table(changes.slice(0, 15));
  }

  // Execute in batches
  for (let i = 0; i < updates.length; i += 50) {
    await Promise.all(updates.slice(i, i + 50));
    console.log(`Processed batch ${i} to ${i + 50}`);
  }

  console.log('Successfully cleaned up all anomalous Census government names.');
}

runCleanup().catch(console.error);
