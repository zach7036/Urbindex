async function test() {
  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter'
  ];
  const q = '[out:json][timeout:10];node["amenity"="restaurant"](around:500, 40.7128, -74.0060);out count;';
  for (const url of servers) {
    try {
      const start = Date.now();
      const r = await fetch(url, {method:'POST', body:'data='+encodeURIComponent(q), signal: AbortSignal.timeout(15000)});
      const status = r.status;
      const txt = await r.text();
      const ms = Date.now()-start;
      let parsed;
      try { parsed = JSON.parse(txt); } catch(e) { parsed = txt.substring(0,200); }
      console.log(`[${status}] ${ms}ms - ${url}`);
      if (typeof parsed === 'object') console.log('  Elements:', parsed.elements?.length);
      else console.log('  Response:', parsed);
    } catch(e) {
      console.log(`[FAIL] ${url} - ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}
test();
