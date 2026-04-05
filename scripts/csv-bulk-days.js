/**
 * Local Bulk NOAA Days Above 90 & Days Below 32 ETL
 * 
 * Uses downloaded `ann-tmax-avgnds.csv` and `ann-tmin-avgnds.csv`
 * Updates `days_above_90` and `days_below_32` for all 4,165 cities based on closest NOAA station.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
  console.log('=== Local Bulk NOAA Days Counts ETL ===\n');

  const dataDir = path.join(__dirname, 'data', 'noaa_normals');
  const inventoryPath = path.join(dataDir, 'mly_inventory.txt');
  const tmaxPath = path.join(dataDir, 'ann-tmax-avgnds.csv');
  const tminPath = path.join(dataDir, 'ann-tmin-avgnds.csv');

  // Load inventory
  console.log('Loading station inventory...');
  const inventoryLines = fs.readFileSync(inventoryPath, 'utf8').split('\n');
  const stations = new Map();
  for (const line of inventoryLines) {
    if (!line.trim()) continue;
    const id = line.substring(0, 11).trim();
    const lat = parseFloat(line.substring(12, 20).trim());
    const lon = parseFloat(line.substring(21, 30).trim());
    if (!isNaN(lat) && !isNaN(lon)) {
      stations.set(id, { id, lat, lon });
    }
  }

  // Load days above 90 (Col 28 in ann-tmax-avgnds.csv: ANN-TMAX-AVGNDS-GRTH090)
  console.log('Loading days > 90 data...');
  const tmaxLines = fs.readFileSync(tmaxPath, 'utf8').split('\n');
  for (let i = 1; i < tmaxLines.length; i++) {
    const cols = tmaxLines[i].split(',');
    if (cols.length < 29) continue;
    const id = cols[0];
    const val = parseFloat(cols[28]?.trim());
    if (stations.has(id) && !isNaN(val) && val !== -9999) {
      stations.get(id).days_above_90 = Math.round(val);
    }
  }

  // Load days below 32 (Col 16 in ann-tmin-avgnds.csv: ANN-TMIN-AVGNDS-LSTH032)
  console.log('Loading days < 32 data...');
  const tminLines = fs.readFileSync(tminPath, 'utf8').split('\n');
  for (let i = 1; i < tminLines.length; i++) {
    const cols = tminLines[i].split(',');
    if (cols.length < 17) continue;
    const id = cols[0];
    const val = parseFloat(cols[16]?.trim());
    if (stations.has(id) && !isNaN(val) && val !== -9999) {
      stations.get(id).days_below_32 = Math.round(val);
    }
  }

  // Filter stations that have both metrics
  const validStations = Array.from(stations.values()).filter(s => 
    s.days_above_90 !== undefined && s.days_below_32 !== undefined
  );
  console.log(`Matched ${validStations.length} stations with complete day count data.\n`);

  // Fetch cities
  console.log('Fetching US cities from Supabase...');
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

  // Assign to nearest station
  const updates = [];
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

    if (closestStation && minDistance < 150) { // Using 150km radius as some counts stations are sparser
      updates.push({
        fips_code: city.fips_code,
        days_above_90: closestStation.days_above_90,
        days_below_32: closestStation.days_below_32
      });
    }
  }

  console.log(`Mapped ${updates.length} cities to weather stations.`);
  
  // Upload to Supabase
  console.log('Uploading to Supabase...');
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
  console.log(`✅ Fixed days_above_90 / days_below_32 for ${successCount} cities.`);
}

main().catch(console.error);
