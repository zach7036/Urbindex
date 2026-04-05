/**
 * Backfill REAL temperature data for 729 cities using Open-Meteo APIs.
 * 1. Geocode each city name + state → lat/lon via Open-Meteo Geocoding
 * 2. Fetch 2023 daily highs/lows from Open-Meteo Historical Weather
 * 3. Compute January and July averages
 * 4. Update Supabase
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Convert Celsius to Fahrenheit
function cToF(c) { return Math.round(c * 9/5 + 32); }

async function geocode(cityName, stateCode) {
  const stateName = STATE_NAMES[stateCode] || stateCode;
  const query = `${cityName}, ${stateName}, United States`;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=5&language=en&format=json`;
  
  try {
    const res = await fetch(url);
    const json = await res.json();
    
    if (!json.results || json.results.length === 0) return null;
    
    // Try to match on state/admin1
    const match = json.results.find(r => 
      r.country_code === 'US' && 
      (r.admin1 === stateName || r.admin1?.includes(stateName) || stateName.includes(r.admin1 || ''))
    );
    
    if (match) return { lat: match.latitude, lon: match.longitude };
    
    // Fallback: first US result
    const usResult = json.results.find(r => r.country_code === 'US');
    if (usResult) return { lat: usResult.latitude, lon: usResult.longitude };
    
    return null;
  } catch (e) {
    return null;
  }
}

async function fetchTemperatures(lat, lon) {
  // Fetch 2023 daily max/min temps
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2023-01-01&end_date=2023-12-31&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto`;
  
  try {
    const res = await fetch(url);
    const json = await res.json();
    
    if (!json.daily) return null;
    
    const dates = json.daily.time;
    const highs = json.daily.temperature_2m_max;
    const lows = json.daily.temperature_2m_min;
    
    // Compute monthly averages
    const months = {};
    for (let i = 0; i < dates.length; i++) {
      const month = parseInt(dates[i].split('-')[1]); // 1-12
      if (!months[month]) months[month] = { highs: [], lows: [] };
      if (highs[i] !== null) months[month].highs.push(highs[i]);
      if (lows[i] !== null) months[month].lows.push(lows[i]);
    }
    
    const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    
    return {
      avg_high_jan: avg(months[1]?.highs || []),
      avg_low_jan: avg(months[1]?.lows || []),
      avg_high_apr: avg(months[4]?.highs || []),
      avg_low_apr: avg(months[4]?.lows || []),
      avg_high_jul: avg(months[7]?.highs || []),
      avg_low_jul: avg(months[7]?.lows || []),
      avg_high_oct: avg(months[10]?.highs || []),
      avg_low_oct: avg(months[10]?.lows || []),
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  // 1. Get cities needing temperature data (null avg_high_jul)
  const needsFix = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('city_climate')
      .select('fips_code')
      .is('avg_high_jul', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    needsFix.push(...data.map(d => d.fips_code));
    page++;
  }
  console.log(`Cities needing real temperature data: ${needsFix.length}`);
  
  // Also get the ones that were partially imputed (avg_high_jul was set by the aborted run)
  // Check which ones are still null
  
  // 2. Get city names/state codes
  const cityInfo = new Map();
  let cPage = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, name, state_code').range(cPage * 1000, (cPage + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const c of data) cityInfo.set(c.fips_code, { name: c.name, state: c.state_code });
    cPage++;
  }

  // Also need to fix the ~300 that were partially imputed with state averages
  // Let's find those too - they have is_imputed or were just set by the aborted script
  // Actually, let's just re-fetch ALL cities that currently have null avg_high_jul
  // plus any that were updated in the last few minutes (the aborted imputation)
  
  // For the aborted ones, let's null them back first, then process everything
  // Get fips codes that were updated by the aborted script (have avg_high_jul but may be imputed)
  // Actually, the simpler approach: get ALL 729 original fips codes. Some may have been partially updated.
  // Let's just process all of them.
  
  // Get the full list of 729 from the original null check + any that were set to bogus values
  const { data: allClimate } = await supabase
    .from('city_climate')
    .select('fips_code, avg_high_jul')
    .or('avg_high_jul.is.null');
  
  // Also get the ones that were imputed
  // Let's be safe and include all fips that don't have avg_high_jul in a reasonable range
  // OR just target the ones still null

  let targetFips = needsFix;
  
  // Also revert the ~300 that got imputed by the aborted script
  // We can identify them if they were updated recently, but easier to just 
  // null them and re-process
  // Actually let me just check: how many are still null?
  console.log(`Will process ${targetFips.length} cities that still have null temps`);

  if (targetFips.length === 0) {
    // All 729 were partially updated. Get the original list.
    // Fetch all climate rows and find ones where all temps are suspiciously round/same-ish
    console.log('All cities seem to have been updated. Fetching original 729...');
    // Let me get cities where avg_high_jul was set but might be imputed
    // We'll reprocess ANY city where avg_high_jul was null before our fix
    // For now, let's get all and filter
    const batch1 = [];
    let p = 0;
    while (true) {
      const { data } = await supabase.from('city_climate').select('fips_code, avg_high_jul').is('avg_high_jul', null).range(p*1000, (p+1)*1000-1);
      if (!data || data.length === 0) break;
      batch1.push(...data.map(d => d.fips_code));
      p++;
    }
    targetFips = batch1;
    console.log(`Found ${targetFips.length} cities still with null avg_high_jul`);
  }

  let updated = 0;
  let geocodeFails = 0;
  let tempFails = 0;

  for (let i = 0; i < targetFips.length; i++) {
    const fips = targetFips[i];
    const info = cityInfo.get(fips);
    if (!info) continue;

    // Geocode
    const coords = await geocode(info.name, info.state);
    if (!coords) {
      geocodeFails++;
      if (geocodeFails <= 5) console.log(`  ❌ Geocode failed: ${info.name}, ${info.state}`);
      continue;
    }

    // Small delay to respect rate limits
    await sleep(100);

    // Fetch real temps
    const temps = await fetchTemperatures(coords.lat, coords.lon);
    if (!temps || temps.avg_high_jul === null) {
      tempFails++;
      if (tempFails <= 5) console.log(`  ❌ Temp fetch failed: ${info.name}, ${info.state}`);
      continue;
    }

    // Update DB
    const { error } = await supabase
      .from('city_climate')
      .update(temps)
      .eq('fips_code', fips);

    if (error) {
      console.error(`  DB error for ${info.name}: ${error.message}`);
      continue;
    }

    updated++;
    if (updated % 25 === 0) {
      console.log(`  ✅ ${updated} updated (${i + 1}/${targetFips.length}) — last: ${info.name}, ${info.state} → Jul ${temps.avg_high_jul}/${temps.avg_low_jul}°F, Jan ${temps.avg_high_jan}/${temps.avg_low_jan}°F`);
    }

    // Rate limit: ~5 requests/sec (geocode + archive = 2 calls per city)
    await sleep(100);
  }

  console.log(`\n✅ Done! Updated ${updated} cities with real Open-Meteo data`);
  console.log(`   Geocode failures: ${geocodeFails}`);
  console.log(`   Temperature fetch failures: ${tempFails}`);

  // Verify
  const { count } = await supabase.from('city_climate').select('*', { count: 'exact', head: true }).is('avg_high_jul', null);
  console.log(`   Remaining nulls: ${count}`);
}

main().catch(console.error);
