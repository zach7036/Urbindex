/**
 * Urbindex — BLS Employment ETL
 * 
 * Fetches employment and unemployment data from the Bureau of Labor Statistics API.
 * Uses the Local Area Unemployment Statistics (LAUS) series.
 * 
 * API: https://api.bls.gov/publicAPI/v2/timeseries/data/
 * Rate limit: 25/day without key, 500/day with key
 * 
 * Usage: Set BLS_API_KEY in .env.local (optional but recommended)
 *        npx ts-node scripts/etl/bls-employment.ts
 */

const BLS_KEY = process.env.BLS_API_KEY || '';
const BASE_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

interface BLSResponse {
  status: string;
  responseTime: number;
  message: string[];
  Results: {
    series: {
      seriesID: string;
      data: {
        year: string;
        period: string;
        periodName: string;
        latest: string;
        value: string;
      }[];
    }[];
  };
}

/**
 * LAUS series ID format: LAUCN + FIPS + type
 * Type 3 = unemployment rate
 * Type 4 = unemployment count
 * Type 5 = employment count
 * Type 6 = labor force
 * 
 * For MSA-level: LAUMT + MSA code + type
 * For state-level: LASST + state FIPS + type
 */

function buildLAUSSeriesId(stateFips: string, countyFips: string, type: number): string {
  return `LAUCN${stateFips}${countyFips}00000000${type}`;
}

// MSA-level unemployment — more useful for cities
function buildMSASeriesId(msaCode: string, type: number): string {
  return `LAUMT${msaCode}00000000${type}`;
}

async function fetchBLSData(seriesIds: string[], startYear: number, endYear: number): Promise<BLSResponse | null> {
  const body: Record<string, unknown> = {
    seriesid: seriesIds,
    startyear: startYear.toString(),
    endyear: endYear.toString(),
  };

  if (BLS_KEY) {
    body.registrationkey = BLS_KEY;
  }

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`BLS API error: ${res.status}`);
      return null;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, BLS_KEY ? 500 : 2000));
    return await res.json() as BLSResponse;
  } catch (error) {
    console.error('BLS fetch failed:', error);
    return null;
  }
}

interface CityInput {
  fips_code: string;
  name: string;
  state_code: string;
  county_fips?: string;
  msa_code?: string;
}

async function runBLSETL(cities: CityInput[]) {
  console.log('📊 Urbindex BLS Employment ETL');
  console.log('==============================');
  console.log(`BLS API Key: ${BLS_KEY ? '✅ Found' : '⚠️  Not set (25 req/day limit)'}`);
  console.log(`Processing ${cities.length} cities...\n`);

  const currentYear = new Date().getFullYear();
  const results: Record<string, { unemployment_rate: number; labor_force: number; employed: number }> = {};

  // BLS API accepts up to 50 series per request
  // We'll batch cities in groups of ~12 (4 series per city)
  const batchSize = BLS_KEY ? 12 : 6;

  for (let i = 0; i < cities.length; i += batchSize) {
    const batch = cities.slice(i, i + batchSize);
    const seriesIds: string[] = [];
    const cityMap: Record<string, CityInput> = {};

    for (const city of batch) {
      if (city.msa_code) {
        const unemploymentRate = buildMSASeriesId(city.msa_code, 3);
        const laborForce = buildMSASeriesId(city.msa_code, 6);
        const employed = buildMSASeriesId(city.msa_code, 5);
        seriesIds.push(unemploymentRate, laborForce, employed);
        cityMap[unemploymentRate] = city;
        cityMap[laborForce] = city;
        cityMap[employed] = city;
      }
    }

    if (seriesIds.length === 0) continue;

    console.log(`Batch ${Math.floor(i / batchSize) + 1}: Fetching ${batch.length} cities...`);
    const data = await fetchBLSData(seriesIds, currentYear - 1, currentYear);

    if (data?.Results?.series) {
      for (const series of data.Results.series) {
        const latestData = series.data.find(d => d.latest === 'true') || series.data[0];
        if (!latestData) continue;

        const value = parseFloat(latestData.value);
        const seriesType = parseInt(series.seriesID.slice(-1));

        // Find matching city
        const city = cityMap[series.seriesID];
        if (!city) continue;

        if (!results[city.fips_code]) {
          results[city.fips_code] = { unemployment_rate: 0, labor_force: 0, employed: 0 };
        }

        switch (seriesType) {
          case 3: results[city.fips_code].unemployment_rate = value; break;
          case 5: results[city.fips_code].employed = value; break;
          case 6: results[city.fips_code].labor_force = value; break;
        }

        console.log(`  ✅ ${city.name}: Series ${seriesType} = ${value}`);
      }
    }
  }

  console.log(`\n📊 BLS ETL Complete: ${Object.keys(results).length}/${cities.length} cities`);
  return results;
}

export { runBLSETL };

if (require.main === module) {
  const demoCities: CityInput[] = [
    { fips_code: '3755000', name: 'Raleigh', state_code: 'NC', msa_code: '39580' },
  ];
  runBLSETL(demoCities).catch(console.error);
}
