/**
 * State-by-State PBF Livability Scorer (v2 — Memory Optimized)
 * =============================================================
 * Downloads individual state PBF files from Geofabrik, processes each
 * state fully (nodes + ways with real centroids), then deletes the file.
 *
 * Memory optimizations for 12GB RAM machines:
 *   - DuckDB capped at 4GB with disk spill via temp_directory
 *   - California split into NorCal/SoCal sub-regions (~500MB each)
 *   - State-level resume tracking (completed_states.json)
 *   - Aggressive intermediate table drops
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/etl/livability-local.ts
 *     --reset   Clear progress and reprocess all states from scratch
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { pipeline } from 'stream/promises';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';
import * as duckdb from 'duckdb-async';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const DOWNLOAD_DIR = path.resolve(__dirname, '../../tmp_pbf');
const DUCKDB_TMP = path.join(DOWNLOAD_DIR, 'duckdb_tmp');
const COMPLETED_FILE = path.resolve(__dirname, '../../completed_states.json');
const DUCKDB_MEMORY_LIMIT = '6GB';

// All US states + DC + PR with Geofabrik URL slugs
const STATES: Record<string, string> = {
  'AL': 'alabama', 'AK': 'alaska', 'AZ': 'arizona', 'AR': 'arkansas',
  'CA': 'california', 'CO': 'colorado', 'CT': 'connecticut', 'DE': 'delaware',
  'DC': 'district-of-columbia', 'FL': 'florida', 'GA': 'georgia', 'HI': 'hawaii',
  'ID': 'idaho', 'IL': 'illinois', 'IN': 'indiana', 'IA': 'iowa',
  'KS': 'kansas', 'KY': 'kentucky', 'LA': 'louisiana', 'ME': 'maine',
  'MD': 'maryland', 'MA': 'massachusetts', 'MI': 'michigan', 'MN': 'minnesota',
  'MS': 'mississippi', 'MO': 'missouri', 'MT': 'montana', 'NE': 'nebraska',
  'NV': 'nevada', 'NH': 'new-hampshire', 'NJ': 'new-jersey', 'NM': 'new-mexico',
  'NY': 'new-york', 'NC': 'north-carolina', 'ND': 'north-dakota', 'OH': 'ohio',
  'OK': 'oklahoma', 'OR': 'oregon', 'PA': 'pennsylvania', 'RI': 'rhode-island',
  'SC': 'south-carolina', 'SD': 'south-dakota', 'TN': 'tennessee', 'TX': 'texas',
  'UT': 'utah', 'VT': 'vermont', 'VA': 'virginia', 'WA': 'washington',
  'WV': 'west-virginia', 'WI': 'wisconsin', 'WY': 'wyoming',
  'PR': 'puerto-rico'
};

// California sub-regions (Geofabrik splits at ~35.8°N)
const CA_SPLIT_LAT = 35.8;
const CA_SUBREGIONS = [
  {
    name: 'norcal', label: 'Northern California',
    url: 'https://download.geofabrik.de/north-america/us/california/norcal-latest.osm.pbf',
    filter: (city: any) => city.latitude >= CA_SPLIT_LAT,
  },
  {
    name: 'socal', label: 'Southern California',
    url: 'https://download.geofabrik.de/north-america/us/california/socal-latest.osm.pbf',
    filter: (city: any) => city.latitude < CA_SPLIT_LAT,
  },
];

// ─── Resume helpers ───────────────────────────────────────────────
function loadCompleted(): Set<string> {
  try { return new Set(JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf8'))); }
  catch { return new Set(); }
}
function markCompleted(key: string) {
  const set = loadCompleted(); set.add(key);
  fs.writeFileSync(COMPLETED_FILE, JSON.stringify([...set], null, 2));
}

// ─── Math (unchanged from v1) ─────────────────────────────────────
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

function scoreCity(filtered: any[], city: any) {
  let cats = { grocery: 0, dining: 0, shopping: 0, edu: 0, health: 0, leisure: 0 };
  let transit = { bus: 0, rail: 0 };
  let bike = { lanes: 0, parking: 0 };
  let exactParks = 0, exactHospitals = 0, exactGrocery = 0;

  for (const row of filtered) {
    const amenity = String(row.amenity || '');
    const shop = String(row.shop || '');
    const leisure = String(row.leisure || '');
    const highway = String(row.highway || '');
    const railway = String(row.railway || '');
    const cycleway = String(row.cycleway || '');

    const dist = computeHaversine(city.latitude, city.longitude, row.lat, row.lon);
    const decay = computeDecay(dist, 1600);
    const bikeDecay = computeDecay(dist, 2500);
    const transitDecay = computeDecay(dist, 2000);

    if (/supermarket|convenience|grocery/.test(shop)) { cats.grocery += decay * 3; exactGrocery++; }
    else if (/restaurant|fast_food|cafe/.test(amenity)) cats.dining += decay * 1;
    else if (/clothes|books|electronics/.test(shop)) cats.shopping += decay * 0.5;
    else if (/school|college|university/.test(amenity)) cats.edu += decay * 1;
    else if (/hospital|clinic|pharmacy|doctors|dentist/.test(amenity)) { cats.health += decay * 1; if (amenity === 'hospital') exactHospitals++; }
    else if (/park|playground|garden/.test(leisure)) { cats.leisure += decay * 1; exactParks++; }

    if (highway === 'bus_stop') transit.bus += transitDecay * 1;
    if (/station|subway_entrance|tram_stop/.test(railway)) transit.rail += transitDecay * 4;
    if (cycleway || highway === 'cycleway') bike.lanes += bikeDecay * 2;
    if (amenity === 'bicycle_parking' || amenity === 'bicycle_rental') bike.parking += bikeDecay * 0.5;
  }

  const walkRaw = Math.min(cats.grocery/15,1)*30 + Math.min(cats.dining/20,1)*20 + Math.min(cats.shopping/10,1)*10 +
                  Math.min(cats.edu/5,1)*15 + Math.min(cats.leisure/8,1)*15 + Math.min(cats.health/5,1)*10;
  const transitRaw = Math.min(transit.bus/25,1)*40 + Math.min(transit.rail/5,1)*60;
  const bikeRaw = Math.min(bike.lanes/25,1)*70 + Math.min(bike.parking/15,1)*30;

  const popBase = city.population || 10000;
  return {
    walkscore: Math.min(100, Math.round(walkRaw)),
    transit_score: Math.min(100, Math.round(transitRaw)),
    bike_score: Math.min(100, Math.round(bikeRaw)),
    parks_per_capita: Math.round((exactParks / (popBase / 10000)) * 10) / 10,
    hospitals_per_capita: Math.round((exactHospitals / (popBase / 100000)) * 10) / 10,
    grocery_stores_per_capita: Math.round((exactGrocery / (popBase / 10000)) * 10) / 10,
  };
}

// ─── Download helper ──────────────────────────────────────────────
async function downloadPBF(url: string, dest: string): Promise<string> {
  if (fs.existsSync(dest)) {
    const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
    process.stdout.write(`(cached ${sizeMB}MB) `);
    return dest;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} for ${url}`);
  const fileStream = fs.createWriteStream(dest);
  // @ts-ignore
  await pipeline(res.body, fileStream);
  const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
  process.stdout.write(`${sizeMB}MB `);
  return dest;
}

// ─── Core: process a single PBF file against a list of cities ─────
async function processPBF(pbfPath: string, cities: any[], label: string): Promise<number> {
  const filePath = pbfPath.replace(/\\/g, '/');
  const tmpDir = DUCKDB_TMP.replace(/\\/g, '/');

  const db = await duckdb.Database.create(':memory:');
  const conn = await db.connect();

  // === MEMORY SAFETY ===
  await conn.run(`SET memory_limit='${DUCKDB_MEMORY_LIMIT}';`);
  await conn.run(`SET temp_directory='${tmpDir}';`);
  await conn.run('SET preserve_insertion_order=false;');
  await conn.run('SET threads TO 1;');
  await conn.run('INSTALL spatial; LOAD spatial;');

  try {
    // Step A: Load tagged nodes
    process.stdout.write('  [A] Tagged nodes... ');
    await conn.run(`
      CREATE TABLE tagged_nodes AS
      SELECT lat, lon, tags FROM st_readosm('${filePath}')
      WHERE kind = 'node' AND tags IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL;
    `);
    let r = await conn.all('SELECT COUNT(*) as c FROM tagged_nodes');
    process.stdout.write(`${r[0].c.toLocaleString()}\n`);

    // Step B: Load ONLY ways with scoring-relevant tags
    process.stdout.write('  [B] Relevant ways... ');
    await conn.run(`
      CREATE TABLE relevant_ways AS
      SELECT id, tags, refs FROM st_readosm('${filePath}')
      WHERE kind = 'way' AND tags IS NOT NULL AND refs IS NOT NULL
      AND (
        list_contains(map_keys(tags), 'amenity')
        OR list_contains(map_keys(tags), 'shop')
        OR list_contains(map_keys(tags), 'leisure')
        OR list_contains(map_keys(tags), 'railway')
        OR list_contains(map_keys(tags), 'cycleway')
        OR (list_contains(map_keys(tags), 'highway')
            AND list_contains(element_at(tags, 'highway'), 'bus_stop'))
        OR (list_contains(map_keys(tags), 'highway')
            AND list_contains(element_at(tags, 'highway'), 'cycleway'))
      );
    `);
    r = await conn.all('SELECT COUNT(*) as c FROM relevant_ways');
    process.stdout.write(`${r[0].c.toLocaleString()}\n`);

    // Step C: Collect way node refs
    process.stdout.write('  [C] Way node refs... ');
    await conn.run(`
      CREATE TABLE needed_node_ids AS
      SELECT DISTINCT UNNEST(refs) as id FROM relevant_ways;
    `);
    r = await conn.all('SELECT COUNT(*) as c FROM needed_node_ids');
    process.stdout.write(`${r[0].c.toLocaleString()} unique refs\n`);

    // Step D: Load targeted node coords
    process.stdout.write('  [D] Node coords... ');
    await conn.run(`
      CREATE TABLE node_coords AS
      SELECT n.id, n.lat, n.lon
      FROM st_readosm('${filePath}') n
      WHERE n.kind = 'node' AND n.lat IS NOT NULL
      AND n.id IN (SELECT id FROM needed_node_ids);
    `);
    r = await conn.all('SELECT COUNT(*) as c FROM node_coords');
    process.stdout.write(`${r[0].c.toLocaleString()}\n`);
    await conn.run('DROP TABLE needed_node_ids;');

    // Step E: Compute way centroids
    process.stdout.write('  [E] Way centroids... ');
    await conn.run('CREATE INDEX idx_nc ON node_coords(id);');
    await conn.run(`
      CREATE TABLE way_centroids AS
      SELECT w.id, w.tags, AVG(nc.lat) as lat, AVG(nc.lon) as lon
      FROM (
        SELECT id, tags, UNNEST(refs) as node_id FROM relevant_ways
      ) w
      JOIN node_coords nc ON w.node_id = nc.id
      GROUP BY w.id, w.tags;
    `);
    r = await conn.all('SELECT COUNT(*) as c FROM way_centroids');
    console.log(`${r[0].c.toLocaleString()} centroids`);
    await conn.run('DROP TABLE node_coords; DROP TABLE relevant_ways;');

    // Step F: Unified amenity table
    await conn.run(`
      CREATE TABLE osm_amenities AS
      SELECT lat, lon, tags FROM tagged_nodes
      UNION ALL
      SELECT lat, lon, tags FROM way_centroids;
    `);
    await conn.run('DROP TABLE tagged_nodes; DROP TABLE way_centroids;');

    // Score cities
    let updated = 0;
    cities.sort((a, b) => (b.population || 0) - (a.population || 0));

    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      const cstart = Date.now();
      process.stdout.write(`  [${i+1}/${cities.length}] ${city.name}... `);

      const latDelta = 0.025;
      const lonDelta = 0.025 / Math.cos(city.latitude * Math.PI / 180);

      try {
        const rows = await conn.all(`
          SELECT lat, lon,
            element_at(tags, 'amenity') as amenity,
            element_at(tags, 'shop') as shop,
            element_at(tags, 'leisure') as leisure,
            element_at(tags, 'highway') as highway,
            element_at(tags, 'railway') as railway,
            element_at(tags, 'cycleway') as cycleway
          FROM osm_amenities
          WHERE lat BETWEEN ${city.latitude - latDelta} AND ${city.latitude + latDelta}
          AND lon BETWEEN ${city.longitude - lonDelta} AND ${city.longitude + lonDelta}
        `);

        const filtered = rows.filter((r: any) => r.amenity || r.shop || r.leisure || r.highway || r.railway || r.cycleway);
        const scores = scoreCity(filtered, city);

        const { error } = await supabase.from('city_livability')
          .update(scores)
          .eq('fips_code', city.fips_code);

        if (error) { console.log(`[DB Error: ${error.message}]`); }
        else {
          updated++;
          console.log(`W:${scores.walkscore} T:${scores.transit_score} B:${scores.bike_score} | ${Date.now()-cstart}ms`);
        }
      } catch (e: any) { console.log(`[Error: ${e.message?.substring(0,80)}]`); }
    }

    return updated;
  } finally {
    await conn.close();
    await db.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('=== State-by-State PBF Livability Scorer v2 (Memory Optimized) ===\n');
  console.log(`  DuckDB memory cap: ${DUCKDB_MEMORY_LIMIT} (spills to disk beyond this)`);
  console.log(`  California: split into NorCal + SoCal sub-regions\n`);

  // --reset flag: wipe progress and old PBF files
  if (process.argv.includes('--reset')) {
    console.log('🔄 --reset flag detected: starting fresh\n');
    try { fs.unlinkSync(COMPLETED_FILE); } catch {}
    // Remove old full-CA file (we use sub-regions now)
    try { fs.unlinkSync(path.join(DOWNLOAD_DIR, 'california.osm.pbf')); } catch {}
  }

  // Ensure directories
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DUCKDB_TMP)) fs.mkdirSync(DUCKDB_TMP, { recursive: true });

  const completed = loadCompleted();

  // Load all cities from Supabase
  console.log('Loading cities from Supabase...');
  const allCities: any[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('cities')
      .select('fips_code, name, state_code, latitude, longitude, population')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allCities.push(...data);
    page++;
  }
  console.log(`${allCities.length} cities loaded\n`);

  // Group cities by state
  const cityByState = new Map<string, any[]>();
  for (const city of allCities) {
    if (!city.latitude || city.latitude === 0) continue;
    const arr = cityByState.get(city.state_code) || [];
    arr.push(city);
    cityByState.set(city.state_code, arr);
  }

  let totalUpdated = 0;
  const stateEntries = Object.entries(STATES);

  for (let s = 0; s < stateEntries.length; s++) {
    const [code, slug] = stateEntries[s];
    const cities = cityByState.get(code) || [];

    if (cities.length === 0) {
      console.log(`[${s+1}/${stateEntries.length}] ${code} (${slug}): No cities, skipping`);
      continue;
    }

    // ─── California: split into NorCal/SoCal ───
    if (code === 'CA') {
      for (const sub of CA_SUBREGIONS) {
        const key = `CA-${sub.name}`;
        const subCities = cities.filter(sub.filter);

        if (subCities.length === 0) continue;

        if (completed.has(key)) {
          console.log(`[${s+1}/${stateEntries.length}] ${key} — ${sub.label} (${subCities.length} cities): ⏭️ Already done`);
          continue;
        }

        console.log(`\n${'═'.repeat(55)}`);
        console.log(`[${s+1}/${stateEntries.length}] ${key} — ${sub.label} (${subCities.length} cities)`);
        console.log(`${'═'.repeat(55)}`);

        process.stdout.write(`  Downloading ${sub.name}... `);
        const dest = path.join(DOWNLOAD_DIR, `${sub.name}.osm.pbf`);
        try {
          await downloadPBF(sub.url, dest);
          console.log('done');
        } catch (e: any) {
          console.log(`[Download failed: ${e.message}]`);
          continue;
        }

        const startTime = Date.now();
        const updated = await processPBF(dest, subCities, key);
        totalUpdated += updated;

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`  ✅ ${key}: ${updated} cities scored in ${elapsed}s`);

        markCompleted(key);
        try { fs.unlinkSync(dest); } catch {}
        await new Promise(r => setTimeout(r, 1000));
      }
      continue;
    }

    // ─── All other states ───
    if (completed.has(code)) {
      console.log(`[${s+1}/${stateEntries.length}] ${code} (${slug}): ⏭️ Already done`);
      continue;
    }

    console.log(`\n${'═'.repeat(55)}`);
    console.log(`[${s+1}/${stateEntries.length}] ${code} — ${slug} (${cities.length} cities)`);
    console.log(`${'═'.repeat(55)}`);

    process.stdout.write(`  Downloading ${slug}... `);
    const dest = path.join(DOWNLOAD_DIR, `${slug}.osm.pbf`);
    try {
      const url = `https://download.geofabrik.de/north-america/us/${slug}-latest.osm.pbf`;
      await downloadPBF(url, dest);
      console.log('done');
    } catch (e: any) {
      console.log(`[Download failed: ${e.message}]`);
      continue;
    }

    const startTime = Date.now();
    const updated = await processPBF(dest, cities, code);
    totalUpdated += updated;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`  ✅ ${code}: ${updated} cities scored in ${elapsed}s`);

    markCompleted(code);
    try { fs.unlinkSync(dest); } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`ALL STATES COMPLETE! Total: ${totalUpdated} cities scored.`);
  console.log(`${'═'.repeat(55)}\n`);

  // Cleanup temp dirs
  try { fs.rmSync(DUCKDB_TMP, { recursive: true }); } catch {}
  try { fs.rmdirSync(DOWNLOAD_DIR); } catch {}
}

main().catch(console.error);
