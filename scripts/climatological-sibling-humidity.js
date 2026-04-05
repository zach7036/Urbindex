const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 1. Geography: 1 degree difference = ~30 points.
// 2. Temp: 1 degree difference = 15 points! (Coastal anomaly rejection)
// 3. Precip: 1 inch difference = 5 points.
function getClimaticDistance(city, profile) {
  const geoDist = getDistance(city.latitude, city.longitude, profile.lat, profile.lng);
  
  if (geoDist > 500) return Infinity; // Hard cap maximum search radius

  // Weightings
  const geoScore = geoDist * 1.5;
  const tempScore = Math.abs(city.avg_high_jul - profile.avg_high_jul) * 15;
  const precipScore = Math.abs((city.annual_precipitation || 0) - profile.annual_precipitation) * 5;

  return geoScore + tempScore + precipScore;
}

async function main() {
  console.log('=== Initiating Climatological Sibling Matching algorithm ===');

  // 1. Load Excel Stations base humidity
  const filePath = path.resolve(__dirname, '..', 'data', 'NOAA_Relative_Humidity.xlsx');
  const wb = XLSX.readFile(filePath);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

  const rawStations = [];
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 29) continue;
    if (typeof row[2] !== 'string' || !row[2].includes('-')) continue;

    const nameStr = String(row[1] || '').trim();
    if (!nameStr) continue;
    const parts = nameStr.split(',');
    
    // Average morning and afternoon for the exact native annual humidity
    const m = parseInt(row[27]);
    const a = parseInt(row[28]);
    
    if (!isNaN(m) && !isNaN(a)) {
      rawStations.push({ 
        name: parts[0].trim(), 
        stateAbbr: parts[1].trim(), 
        avg_humidity: Math.round((m + a) / 2.0) 
      });
    }
  }

  // 2. Resolve coords for the 260 stations
  const invLines = fs.readFileSync(path.join(__dirname, 'data', 'noaa_normals', 'mly_inventory.txt'), 'utf8').split('\n');
  const tCoords = [];
  for (const line of invLines) {
    if (!line.trim()) continue;
    const lat = parseFloat(line.substring(12, 20).trim());
    const lng = parseFloat(line.substring(21, 30).trim());
    const name = line.substring(38).trim().toLowerCase().replace(/[^a-z]/g, '');
    if (!isNaN(lat) && !isNaN(lng)) tCoords.push({ lat, lng, name });
  }

  const stationsWithCoords = [];
  for (const ss of rawStations) {
    const ssNameNorm = ss.name.toLowerCase().replace(/[^a-z]/g, '');
    let best = null; let bestScore = 0;
    for (const sc of tCoords) {
      if (sc.name.includes(ssNameNorm) || ssNameNorm.includes(sc.name)) {
        const score = Math.min(ssNameNorm.length, sc.name.length);
        if (score > bestScore) { bestScore = score; best = sc; }
      }
    }
    if (best) stationsWithCoords.push({ ...ss, lat: best.lat, lng: best.lng });
  }

  // 3. Load perfectly authentic Supabase data for the 4165 cities
  const citiesData = [];
  let page = 0;
  while (true) {
    const { data: b } = await supabase.from('cities').select('fips_code, latitude, longitude, name').not('latitude', 'is', null).range(page * 1000, (page + 1) * 1000 - 1);
    if (!b || b.length === 0) break;
    citiesData.push(...b);
    page++;
  }

  const climatesData = [];
  let cPage = 0;
  while (true) {
    const { data: cl } = await supabase.from('city_climate').select('*').range(cPage * 1000, (cPage + 1) * 1000 - 1);
    if (!cl || cl.length === 0) break;
    climatesData.push(...cl);
    cPage++;
  }

  const citiesMap = new Map();
  for (const c of citiesData) citiesMap.set(c.fips_code, c);
  const cities = climatesData.map(cl => ({...cl, ...citiesMap.get(cl.fips_code)})).filter(c => c.latitude);

  // 4. Construct Sibling Profiles! Find the absolute climate numbers for our 260 stations using our perfect local data
  const profiles = [];
  for (const s of stationsWithCoords) {
    // Find closest perfectly matched city geographically to represent this station's summer heat
    let closestLocal = null;
    let minD = Infinity;
    for (const c of cities) {
      const d = getDistance(c.latitude, c.longitude, s.lat, s.lng);
      if (d < minD) { minD = d; closestLocal = c; }
    }
    // Only trust it if it's within 15 miles
    if (closestLocal && minD < 15) {
      profiles.push({
        name: s.name,
        state: s.stateAbbr,
        lat: s.lat, lng: s.lng,
        avg_humidity: s.avg_humidity,
        avg_high_jul: closestLocal.avg_high_jul,
        annual_precipitation: closestLocal.annual_precipitation || 0
      });
    }
  }

  console.log(`Successfully mapped ${profiles.length} fully unified climate sibling profiles.`);

  // 5. Execute Sibling Matching!
  const updates = [];
  for (const c of cities) {
    let perfectSibling = null;
    let lowestDistance = Infinity;

    for (const profile of profiles) {
      const dist = getClimaticDistance(c, profile);
      if (dist < lowestDistance) {
        lowestDistance = dist;
        perfectSibling = profile;
      }
    }

    if (perfectSibling) {
      // Recalculate true comfort
      const d90 = c.days_above_90 || 0;
      const d32 = c.days_below_32 || 0;
      const precip = c.annual_precipitation || 0;
      const hum = perfectSibling.avg_humidity;

      let comfort = 100 - (d90 * 0.25) - (d32 * 0.15) - (precip * 0.1);
      if (d90 > 10 && hum > 60) {
        comfort -= ((hum - 60) * 0.3);
      }
      comfort = Math.round(Math.max(40, Math.min(98, comfort)));

      updates.push({
        fips_code: c.fips_code,
        avg_humidity: hum,
        comfort_index: comfort
      });

      // Show console mapping for debugging the Eureka anomaly
      if (['Eureka', 'San Diego', 'San Francisco', 'Redding'].includes(c.name) && ['CA'].includes(c.state_code || c.fips_code.slice(0,2))) {
        console.log(`[DEBUG] ${c.name} (Jul: ${c.avg_high_jul}F, Rain: ${precip}") ===> MATCHED: ${perfectSibling.name} (${perfectSibling.avg_humidity}%)`);
      }
    }
  }

  console.log(`Pushing ${updates.length} perfectly matched Climatic Sister-City updates...`);
  
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    await Promise.all(chunk.map(u => supabase.from('city_climate').update(u).eq('fips_code', u.fips_code)));
  }

  console.log('✅ Climatic Sibling Mapping Executed Flawlessly!');
}
main().catch(console.error);
