import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function patchSanFrancisco() {
  console.log('Patching San Francisco coordinates to Financial District...');

  // True downtown SF coordinates
  const DOWNTOWN_LAT = 37.7749;
  const DOWNTOWN_LNG = -122.4194;

  const { data, error } = await supabase
    .from('cities')
    .update({
      latitude: DOWNTOWN_LAT,
      longitude: DOWNTOWN_LNG
    })
    .eq('name', 'San Francisco')
    .eq('state_code', 'CA')
    .select('name, state_code, latitude, longitude');

  if (error) {
    console.error('Failed to update SF:', error.message);
  } else {
    console.log('Successfully patched:', JSON.stringify(data, null, 2));
    
    // Also reset walkscore incase it was marked with 0 so it can re-process
    const { error: resetErr } = await supabase
      .from('city_livability')
      .update({ walkscore: null })
      .eq('fips_code', '0667000'); // SF FIPS
      
    if (!resetErr) {
        console.log('Reset San Francisco livability walkscore to NULL to force re-processing.');
    }
  }
}

patchSanFrancisco().catch(console.error);
