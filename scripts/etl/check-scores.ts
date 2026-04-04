import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

async function main() {
  const s = createServiceClient();
  const names = ['New York', 'Chicago', 'Austin', 'San Francisco', 'Seattle', 'Denver', 'Annapolis', 'Hartford', 'Boston', 'Philadelphia', 'Portland'];
  
  for (const name of names) {
    const { data: c } = await s.from('cities').select('fips_code, latitude, longitude').eq('name', name).limit(1).single();
    if (!c) { console.log(`${name}: NOT FOUND`); continue; }
    const { data: l } = await s.from('city_livability').select('walkscore, transit_score, bike_score').eq('fips_code', c.fips_code).single();
    console.log(`${name.padEnd(18)} W:${String(l?.walkscore).padStart(3)} T:${String(l?.transit_score).padStart(3)} B:${String(l?.bike_score).padStart(3)}  (lat:${c.latitude} lon:${c.longitude})`);
  }
}
main();
