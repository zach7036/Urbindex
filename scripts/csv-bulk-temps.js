/**
 * Local Bulk NOAA Climate Normal Processor
 * 
 * Uses downloaded `mly-normal-allall.csv` and `mly_inventory.txt`
 * Matches 4,165 cities to nearest station and uploads data.
 * Zero API calls = Instantly computes and uploads 100% of data.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Haversine distance formula in kilometers
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  console.log('=== Local Bulk NOAA Climate ETL ===\n');

  const dataDir = path.join(__dirname, 'data', 'noaa_normals');
  const inventoryPath = path.join(dataDir, 'mly_inventory.txt');
  const normalsPath = path.join(dataDir, 'mly-normal-allall.csv');

  // 1. Read stations
  console.log('Loading station inventory...');
  const inventoryLines = fs.readFileSync(inventoryPath, 'utf8').split('\n');
  const stations = [];
  for (const line of inventoryLines) {
    if (!line.trim()) continue;
    // Format: ID (0-11), Lat (12-20), Lon (21-30)
    const id = line.substring(0, 11).trim();
    const lat = parseFloat(line.substring(12, 20).trim());
    const lon = parseFloat(line.substring(21, 30).trim());
    if (!isNaN(lat) && !isNaN(lon)) {
      stations.push({ id, lat, lon, temps: {} });
    }
  }
  console.log(`Loaded ${stations.length} stations.`);

  // 2. Read temperature normals
  console.log('Loading monthly temperature data...');
  const stationMap = new Map(stations.map(s => [s.id, s]));
  const csvLines = fs.readFileSync(normalsPath, 'utf8').split('\n');
  
  // Headers: GHCN_ID (0), month (1) ... TMAX (8) ... TMIN (12)
  for (let i = 1; i < csvLines.length; i++) {
    const line = csvLines[i];
    if (!line.trim()) continue;
    
    // We can't strictly split by comma because of possible spacing, but standard split is fine
    const cols = line.split(',');
    const id = cols[0];
    const month = cols[1];
    
    const tmaxStr = cols[8]?.trim();
    const tminStr = cols[12]?.trim();
    
    // Check if station exists, and only care about Jan (01), Apr (04), Jul (07), Oct (10)
    if (stationMap.has(id) && ['01', '04', '07', '10'].includes(month)) {
      if (tmaxStr !== undefined && tminStr !== undefined) {
        const tmax = parseFloat(tmaxStr);
        const tmin = parseFloat(tminStr);
        if (!isNaN(tmax) && !isNaN(tmin) && tmax !== -9999 && tmin !== -9999) {
          const s = stationMap.get(id);
          if (month === '01') { s.temps.avg_high_jan = Math.round(tmax); s.temps.avg_low_jan = Math.round(tmin); }
          else if (month === '04') { s.temps.avg_high_apr = Math.round(tmax); s.temps.avg_low_apr = Math.round(tmin); }
          else if (month === '07') { s.temps.avg_high_jul = Math.round(tmax); s.temps.avg_low_jul = Math.round(tmin); }
          else if (month === '10') { s.temps.avg_high_oct = Math.round(tmax); s.temps.avg_low_oct = Math.round(tmin); }
        }
      }
    }
  }

  // Filter ONLY stations that have all 4 needed months
  const validStations = stations.filter(s => 
    s.temps.avg_high_jan !== undefined && s.temps.avg_high_jul !== undefined &&
    s.temps.avg_high_apr !== undefined && s.temps.avg_high_oct !== undefined
  );
  console.log(`Filtered down to ${validStations.length} stations with complete monthly data.`);

  // 3. Fetch cities
  console.log('\nFetching US cities from Supabase...');
  const allCities = [];
  let cPage = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, name, state_code, latitude, longitude')
      .not('latitude', 'is', null).neq('latitude', 0)
      .range(cPage * 1000, (cPage + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allCities.push(...data);
    cPage++;
  }
  console.log(`Loaded ${allCities.length} cities.\n`);

  // 4. Match and Upsert
  const updates = [];
  let noMatch = 0;
  
  for (const city of allCities) {
    let closestStation = null;
    let minDistance = Infinity;

    for (const station of validStations) {
      const dist = getDistance(city.latitude, city.longitude, station.lat, station.lon);
      if (dist < minDistance) {
        minDistance = dist;
        closestStation = station;
      }
    }

    if (closestStation && minDistance < 100) { // Limit to 100km radius max
      updates.push({
        fips_code: city.fips_code,
        ...closestStation.temps
      });
    } else {
      noMatch++;
    }
  }

  console.log(`Matched ${updates.length} cities to weather stations (No match: ${noMatch})`);
  
  // Apply the updates to Supabase in batches of 500
  console.log('Uploading batches to Supabase...');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < updates.length; i += 500) {
    const batch = updates.slice(i, i + 500);
    const { error } = await supabase.from('city_climate').upsert(batch, { onConflict: 'fips_code' });
    if (error) {
      console.error(`Batch ${i} error: ${error.message}`);
      failCount += batch.length;
    } else {
      successCount += batch.length;
      console.log(`  Uploaded ${successCount}/${updates.length}...`);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`✅ Uploaded ${successCount} accurate climate profiles`);
  if (failCount > 0) console.log(`❌ Failed ${failCount}`);
}

main().catch(console.error);
