/**
 * Fetch real temps for ALL 4,165 cities using Open-Meteo.
 * Uses city lat/lon directly (no geocoding needed!), cutting API calls in half.
 * Processes at ~1 request/second to stay well under rate limits.
 * Saves progress to a local JSON file so it can resume if interrupted.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROGRESS_FILE = path.join(__dirname, 'temp-progress.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch {}
  return { completed: {} };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
}

async function fetchTemps(lat, lon, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2023-01-01&end_date=2023-12-31&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto`;
      const res = await fetch(url);
      
      if (res.status === 429) {
        const wait = (attempt + 1) * 10000;
        console.log(`    ⏳ Rate limited, waiting ${wait/1000}s...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) { await sleep(2000); continue; }
      
      const json = await res.json();
      if (!json.daily) return null;
      
      const months = {};
      for (let i = 0; i < json.daily.time.length; i++) {
        const m = parseInt(json.daily.time[i].split('-')[1]);
        if (!months[m]) months[m] = { h: [], l: [] };
        if (json.daily.temperature_2m_max[i] != null) months[m].h.push(json.daily.temperature_2m_max[i]);
        if (json.daily.temperature_2m_min[i] != null) months[m].l.push(json.daily.temperature_2m_min[i]);
      }
      const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
      
      return {
        avg_high_jan: avg(months[1]?.h || []), avg_low_jan: avg(months[1]?.l || []),
        avg_high_apr: avg(months[4]?.h || []), avg_low_apr: avg(months[4]?.l || []),
        avg_high_jul: avg(months[7]?.h || []), avg_low_jul: avg(months[7]?.l || []),
        avg_high_oct: avg(months[10]?.h || []), avg_low_oct: avg(months[10]?.l || []),
      };
    } catch (e) { await sleep(3000); }
  }
  return null;
}

async function main() {
  console.log('=== Open-Meteo Temperature Fetch (Direct Lat/Lon, No Geocoding) ===\n');
  const startTime = Date.now();
  const progress = loadProgress();

  // Get all cities WITH coordinates
  const allCities = [];
  let cPage = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, name, state_code, latitude, longitude')
      .not('latitude', 'is', null).neq('latitude', 0)
      .order('fips_code').range(cPage * 1000, (cPage + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allCities.push(...data);
    cPage++;
  }

  // Filter out already completed
  const todo = allCities.filter(c => !progress.completed[c.fips_code]);
  const alreadyDone = allCities.length - todo.length;
  console.log(`Total: ${allCities.length} | Already done: ${alreadyDone} | Remaining: ${todo.length}\n`);

  let updated = 0;
  let failures = 0;
  const failed = [];

  for (let i = 0; i < todo.length; i++) {
    const city = todo[i];

    // Single API call per city (no geocoding needed!)
    const temps = await fetchTemps(city.latitude, city.longitude);
    
    if (!temps || temps.avg_high_jul === null) {
      failures++;
      failed.push(`${city.name}, ${city.state_code}`);
      await sleep(500);
      continue;
    }

    // Update DB
    const { error } = await supabase.from('city_climate').update(temps).eq('fips_code', city.fips_code);
    if (error) { failures++; continue; }

    updated++;
    progress.completed[city.fips_code] = true;

    // Save progress every 25 cities
    if (updated % 25 === 0) saveProgress(progress);

    // Log every 100 cities
    if (updated % 100 === 0 || updated === 1) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const rate = updated / ((Date.now() - startTime) / 1000);
      const eta = rate > 0 ? ((todo.length - i) / rate / 60).toFixed(1) : '?';
      console.log(`  [${alreadyDone + updated}/${allCities.length}] ${city.name}, ${city.state_code} → Jul: ${temps.avg_high_jul}/${temps.avg_low_jul}°F  Jan: ${temps.avg_high_jan}/${temps.avg_low_jan}°F  (${elapsed}m, ~${eta}m left)`);
    }

    // ~1 request per second to avoid rate limits
    await sleep(800);
  }

  saveProgress(progress);
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log(`\n=== DONE ===`);
  console.log(`✅ Updated this run: ${updated}`);
  console.log(`✅ Total completed: ${Object.keys(progress.completed).length}/${allCities.length}`);
  console.log(`❌ Failures: ${failures}`);
  console.log(`⏱️  Time: ${totalTime} minutes`);
  if (failed.length > 0) {
    console.log(`\nFailed (${failed.length}):`);
    failed.slice(0, 20).forEach(c => console.log(`  - ${c}`));
  }
}

main().catch(console.error);
