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

async function main() {
  console.log('Restoring ACTUAL NOAA Sunny Days data...');
  const filePath = path.resolve(__dirname, '..', 'data', 'NOAA_Mean_Cloud_Cover_Days.xlsx');
  const wb = XLSX.readFile(filePath);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

  const stations = [];
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 42) continue;
    const nameStr = String(row[1] || '').trim();
    if (!nameStr) continue;
    const parts = nameStr.split(',');
    const stateAbbr = parts[parts.length - 1].trim();
    const clearDays = parseInt(row[39]);
    const pcDays = parseInt(row[40]);
    if (!isNaN(clearDays) && !isNaN(pcDays)) {
      stations.push({ name: parts[0].trim(), stateAbbr, sunny_days: clearDays + pcDays });
    }
  }
  console.log(`Parsed ${stations.length} sunshine stations.`);

  // Load NOAA normal coords directly from our mly_inventory.txt which we already verified works!
  const invLines = fs.readFileSync(path.join(__dirname, 'data', 'noaa_normals', 'mly_inventory.txt'), 'utf8').split('\n');
  const tCoords = [];
  for (const line of invLines) {
    if (!line.trim()) continue;
    const lat = parseFloat(line.substring(12, 20).trim());
    const lng = parseFloat(line.substring(21, 30).trim());
    // Station names are from col 38 to 68 usually, let's just grab the remainder
    const name = line.substring(38).trim().toLowerCase().replace(/[^a-z]/g, '');
    if (!isNaN(lat) && !isNaN(lng)) tCoords.push({ lat, lng, name });
  }

  // Assign coords
  const stationsWithCoords = [];
  for (const ss of stations) {
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

  // Load Cities
  const cities = [];
  let page = 0;
  while (true) {
    const { data: b } = await supabase.from('cities').select('fips_code, latitude, longitude').not('latitude', 'is', null).range(page * 1000, (page + 1) * 1000 - 1);
    if (!b || b.length === 0) break;
    cities.push(...b);
    page++;
  }

  // Match
  const updates = [];
  for (const c of cities) {
    let closest = null, min = Infinity;
    for (const s of stationsWithCoords) {
      const d = getDistance(c.latitude, c.longitude, s.lat, s.lng);
      if (d < min) { min = d; closest = s; }
    }
    if (closest) updates.push({ fips_code: c.fips_code, sunny_days: closest.sunny_days });
  }

  console.log(`Applying ${updates.length} raw sunny day values...`);
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    await Promise.all(chunk.map(u => supabase.from('city_climate').update({ sunny_days: u.sunny_days }).eq('fips_code', u.fips_code)));
  }
  console.log('✅ Sunny days restored to actual correct values.');
}
main().catch(console.error);
