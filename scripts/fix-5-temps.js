const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const STATE_NAMES = {
  NV:'Nevada', OR:'Oregon', CA:'California'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function geocode(name, stateCode) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.results) return null;
  const match = json.results.find(r => r.country_code === 'US' && r.admin1 === STATE_NAMES[stateCode]);
  return match ? { lat: match.latitude, lon: match.longitude } : null;
}

async function fetchTemps(lat, lon) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2023-01-01&end_date=2023-12-31&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.daily) return null;
  const months = {};
  for (let i = 0; i < json.daily.time.length; i++) {
    const m = parseInt(json.daily.time[i].split('-')[1]);
    if (!months[m]) months[m] = { h: [], l: [] };
    if (json.daily.temperature_2m_max[i] != null) months[m].h.push(json.daily.temperature_2m_max[i]);
    if (json.daily.temperature_2m_min[i] != null) months[m].l.push(json.daily.temperature_2m_min[i]);
  }
  const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
  return {
    avg_high_jan: avg(months[1].h), avg_low_jan: avg(months[1].l),
    avg_high_apr: avg(months[4].h), avg_low_apr: avg(months[4].l),
    avg_high_jul: avg(months[7].h), avg_low_jul: avg(months[7].l),
    avg_high_oct: avg(months[10].h), avg_low_oct: avg(months[10].l),
  };
}

async function main() {
  const targets = [
    { fips: '3260600', name: 'Reno', state: 'NV' },
    { fips: '3268400', name: 'Sparks', state: 'NV' },
    { fips: '3268700', name: 'Sun Valley', state: 'NV' },
    { fips: '4157950', name: 'Prineville', state: 'OR' },
    { fips: '0680588', name: 'Truckee', state: 'CA' },
  ];

  for (const city of targets) {
    const coords = await geocode(city.name, city.state);
    if (!coords) { console.log(`❌ Geocode failed: ${city.name}`); continue; }
    await sleep(100);
    
    const temps = await fetchTemps(coords.lat, coords.lon);
    if (!temps) { console.log(`❌ Temps failed: ${city.name}`); continue; }
    
    const { error } = await supabase.from('city_climate').update(temps).eq('fips_code', city.fips);
    console.log(`${error ? '❌' : '✅'} ${city.name}, ${city.state}: Jul ${temps.avg_high_jul}/${temps.avg_low_jul}°F  Jan ${temps.avg_high_jan}/${temps.avg_low_jan}°F`);
    await sleep(100);
  }
}

main();
