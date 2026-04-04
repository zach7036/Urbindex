import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';
import * as duckdb from 'duckdb-async';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function computeHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180;
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function computeDecay(distMeters: number, maxDist: number = 1600): number {
  if (distMeters <= 400) return 1.0;
  if (distMeters > maxDist) return 0.0;
  return 1 - ((distMeters - 400) / (maxDist - 400));
}

async function main() {
  const pbfPath = process.argv[2];
  const db = await duckdb.Database.create(':memory:');
  const conn = await db.connect();
  await conn.run('INSTALL spatial; LOAD spatial;');
  console.log('Loading PBF...');
  await conn.run(`CREATE TABLE osm_data AS SELECT * FROM st_readosm('${pbfPath.replace(/\\/g, '/')}') WHERE kind = 'node' AND tags IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL;`);
  console.log('PBF loaded!');

  const { data: topCities } = await supabase.from('cities').select('fips_code, name, state_code, latitude, longitude, population').order('population', { ascending: false }).limit(20);

  const lines: string[] = [];
  lines.push('| City | Pop | Overpass W | Overpass T | Overpass B | PBF W | PBF T | PBF B | Match |');
  lines.push('|---|---|---|---|---|---|---|---|---|');

  for (const city of topCities!) {
    const { data: l } = await supabase.from('city_livability').select('walkscore, transit_score, bike_score').eq('fips_code', city.fips_code).single();
    const dbW = l?.walkscore ?? 0, dbT = l?.transit_score ?? 0, dbB = l?.bike_score ?? 0;

    const latDelta = 0.025;
    const lonDelta = 0.025 / Math.cos(city.latitude * Math.PI / 180);
    const rows = await conn.all(`SELECT lat, lon, element_at(tags, 'amenity') as amenity, element_at(tags, 'shop') as shop, element_at(tags, 'leisure') as leisure, element_at(tags, 'highway') as highway, element_at(tags, 'railway') as railway, element_at(tags, 'cycleway') as cycleway FROM osm_data WHERE lat BETWEEN ${city.latitude - latDelta} AND ${city.latitude + latDelta} AND lon BETWEEN ${city.longitude - lonDelta} AND ${city.longitude + lonDelta}`);
    const filtered = rows.filter((r: any) => r.amenity || r.shop || r.leisure || r.highway || r.railway || r.cycleway);

    let cats = { grocery: 0, dining: 0, shopping: 0, edu: 0, health: 0, leisure: 0 };
    let transit = { bus: 0, rail: 0 }; let bike = { lanes: 0, parking: 0 };

    for (const row of filtered) {
      const amenity = String(row.amenity||''), shop = String(row.shop||''), leisure = String(row.leisure||'');
      const highway = String(row.highway||''), railway = String(row.railway||''), cycleway = String(row.cycleway||'');
      const dist = computeHaversine(city.latitude, city.longitude, row.lat, row.lon);
      const decay = computeDecay(dist, 1600), bikeDecay = computeDecay(dist, 2500), transitDecay = computeDecay(dist, 2000);

      if (/supermarket|convenience|grocery/.test(shop)) cats.grocery += decay * 3;
      else if (/restaurant|fast_food|cafe/.test(amenity)) cats.dining += decay * 1;
      else if (/clothes|books|electronics/.test(shop)) cats.shopping += decay * 0.5;
      else if (/school|college|university/.test(amenity)) cats.edu += decay * 1;
      else if (/hospital|clinic|pharmacy|doctors|dentist/.test(amenity)) cats.health += decay * 1;
      else if (/park|playground|garden/.test(leisure)) cats.leisure += decay * 1;
      if (highway === 'bus_stop') transit.bus += transitDecay * 1;
      if (/station|subway_entrance|tram_stop/.test(railway)) transit.rail += transitDecay * 4;
      if (cycleway || highway === 'cycleway') bike.lanes += bikeDecay * 2;
      if (amenity === 'bicycle_parking' || amenity === 'bicycle_rental') bike.parking += bikeDecay * 0.5;
    }

    const walkRaw = Math.min(cats.grocery/15,1)*30+Math.min(cats.dining/20,1)*20+Math.min(cats.shopping/10,1)*10+Math.min(cats.edu/5,1)*15+Math.min(cats.leisure/8,1)*15+Math.min(cats.health/5,1)*10;
    const localW = Math.round(walkRaw), localT = Math.round(Math.min(transit.bus/25,1)*40+Math.min(transit.rail/5,1)*60);
    const localB = Math.round(Math.min(bike.lanes/25,1)*70+Math.min(bike.parking/15,1)*30);

    const match = (localW === dbW && localT === dbT && localB === dbB) ? '✅ EXACT' :
                  (Math.abs(localW-dbW)<=5 && Math.abs(localT-dbT)<=5 && Math.abs(localB-dbB)<=5) ? '≈ Close' : '⚠️ Diff';

    lines.push(`| ${city.name}, ${city.state_code} | ${city.population?.toLocaleString()} | ${dbW} | ${dbT} | ${dbB} | ${localW} | ${localT} | ${localB} | ${match} |`);
  }

  const output = lines.join('\n');
  fs.writeFileSync(path.resolve(__dirname, '../../comparison.txt'), output);
  console.log(output);
  await conn.close(); await db.close();
}
main().catch(console.error);
