import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function updateCoordinates() {
  console.log('🌍 Parsing Census Gazetteer file for City Coordinates...');
  const filePath = path.join(__dirname, 'data', '2023_Gaz_place_national.txt');
  
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  // Format:
  // USPS GEOID ANSICODE NAME LSAD FUNCSTAT ALAND AWATER ALAND_SQMI AWATER_SQMI INTPTLAT INTPTLONG
  const updates: Record<string, { lat: number; lng: number }> = {};
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length >= 12) {
      const geoid = parts[1].trim();
      const lat = parseFloat(parts[10].trim());
      const lng = parseFloat(parts[11].trim());
      updates[geoid] = { lat, lng };
    }
  }

  console.log(`Parsed ${Object.keys(updates).length} coordinates.`);
  console.log('Fetching cities from Supabase...');

  let allCities: any[] = [];
  let hasMore = true;
  let page = 0;
  while(hasMore) {
    const { data: chunk } = await supabase
      .from('cities')
      .select('fips_code, name, state_code')
      .range(page * 1000, (page + 1) * 1000 - 1);
    
    if (chunk && chunk.length > 0) {
      allCities.push(...chunk);
      page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`Found ${allCities.length} cities in DB. Resolving coordinates...`);

  const toUpdate = [];
  for (const city of allCities) {
    const coords = updates[city.fips_code];
    if (coords) {
      toUpdate.push({
        fips_code: city.fips_code,
        latitude: coords.lat,
        longitude: coords.lng,
      });
    }
  }

  console.log(`Ready to update ${toUpdate.length} cities with coordinates.`);

  let successCount = 0;
  // Supabase upserts shouldn't overwrite other fields if we use the update mechanic or UPSERT with careful columns
  // Wait, Supabase update doesn't have a reliable bulk update endpoint for arbitrary values unless we use `upsert` and ignore other fields,
  // But wait, upsert replaces missing fields with defaults.
  // Instead, we will issue updates in parallel batches.
  
  const BATCH_SIZE = 50;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE);
    
    const promises = batch.map(city => 
      supabase
        .from('cities')
        .update({ latitude: city.latitude, longitude: city.longitude })
        .eq('fips_code', city.fips_code)
    );

    await Promise.all(promises);
    successCount += batch.length;
    process.stdout.write(`\rUpdated ${successCount}/${toUpdate.length}...`);
  }

  console.log('\n✅ All coordinates updated successfully!');
}

updateCoordinates().catch(console.error);
