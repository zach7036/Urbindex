/**
 * Urbindex — FBI Crime Data ETL
 * 
 * Fetches crime statistics from the FBI Crime Data Explorer API.
 * 
 * API: https://api.usa.gov/crime/fbi/sapi/
 * Rate limit: 1,000 req/hour with data.gov key
 * 
 * Usage: Set DATA_GOV_API_KEY in .env.local
 *        npx ts-node --project tsconfig.scripts.json -r tsconfig-paths/register scripts/etl/fbi-crime.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { createClient } from '@supabase/supabase-js';

const API_KEY = process.env.DATA_GOV_API_KEY || 'DEMO_KEY';
const BASE_URL = 'https://api.usa.gov/crime/fbi/sapi';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

let apiCalls = 0;

interface AgencyResult {
  ori: string;
  agency_name: string;
  state_abbr: string;
  city_name: string;
  county_name: string;
  agency_type_name: string;
  latitude: number;
  longitude: number;
}

interface CrimeEstimate {
  year: number;
  population: number;
  violent_crime: number;
  homicide: number;
  rape_revised: number;
  robbery: number;
  aggravated_assault: number;
  property_crime: number;
  burglary: number;
  larceny: number;
  motor_vehicle_theft: number;
  arson: number;
}

async function fbiFetch(endpoint: string): Promise<any> {
  const url = `${BASE_URL}${endpoint}?api_key=${API_KEY}`;
  
  try {
    apiCalls++;
    const res = await fetch(url);
    if (res.status === 429) {
      console.log('🛑 [RATE LIMIT HIT] 1,000 req/hr limit reached on data.gov API.');
      return 'RATE_LIMIT';
    }
    if (!res.ok) {
      console.log(`Failed fetch: ${url} -> ${res.status}`);
      return null;
    }
    // Rate limit: be polite
    await new Promise(r => setTimeout(r, 100));
    return await res.json();
  } catch (error) {
    return null;
  }
}

async function getStateAgencies(stateAbbr: string): Promise<AgencyResult[]> {
  const result = await fbiFetch(`/api/agencies/byStateAbbr/${stateAbbr}`);
  if (result === 'RATE_LIMIT') return [];
  return result?.results || result || [];
}

async function getAgencyCrimeData(ori: string, year: number = 2022): Promise<CrimeEstimate | null | 'RATE_LIMIT'> {
  const result = await fbiFetch(`/api/summarized/agencies/${ori}/violent-property/2022/2022`);
  if (result === 'RATE_LIMIT') return 'RATE_LIMIT';

  if (!result?.results?.length) return null;

  const data = result.results[0];
  
  return {
    year: 2022,
    population: data.population || 1,
    violent_crime: data.actual || 0,
    homicide: data.homicide || 0,
    rape_revised: data.rape_revised || 0,
    robbery: data.robbery || 0,
    aggravated_assault: data.aggravated_assault || 0,
    property_crime: data.property_crime || 0,
    burglary: data.burglary || 0,
    larceny: data.larceny || 0,
    motor_vehicle_theft: data.motor_vehicle_theft || 0,
    arson: data.arson || 0,
  };
}

function computeCrimeRates(estimate: CrimeEstimate) {
  const pop = estimate.population || 1;
  const per100k = (val: number) => Math.round(((val || 0) / pop) * 100000 * 100) / 100;

  const violentRate = per100k(estimate.violent_crime);
  const propertyRate = per100k(estimate.property_crime);

  const violentScore = Math.max(0, 100 - (violentRate / 380) * 50);
  const propertyScore = Math.max(0, 100 - (propertyRate / 1900) * 50);
  const safetyScore = Math.round((violentScore * 0.7) + (propertyScore * 0.3));

  return {
    violent_crime_rate: violentRate,
    property_crime_rate: propertyRate,
    total_crime_rate: violentRate + propertyRate,
    crime_breakdown: {
      murder: per100k(estimate.homicide),
      rape: per100k(estimate.rape_revised),
      robbery: per100k(estimate.robbery),
      aggravated_assault: per100k(estimate.aggravated_assault),
      burglary: per100k(estimate.burglary),
      larceny: per100k(estimate.larceny),
      motor_vehicle_theft: per100k(estimate.motor_vehicle_theft),
      arson: per100k(estimate.arson),
    },
    safety_score: Math.min(100, Math.max(0, safetyScore)),
    crime_trend: 'stable'
  };
}

async function runCrimeETL() {
  console.log('🔫 Urbindex FBI Crime Data ETL');
  console.log('==============================');

  if (API_KEY === 'DEMO_KEY' || !API_KEY) {
    console.error('❌ DATA_GOV_API_KEY not set. Get one at: https://api.data.gov/signup/');
    return;
  }

  console.log('🔍 Fetching cities needing crime data...');
  
  let allCities: any[] = [];
  let hasMore = true;
  let page = 0;
  while(hasMore) {
    const { data: chunk } = await supabase
      .from('cities')
      .select('fips_code, name, state_code')
      .order('population', { ascending: false })
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (chunk && chunk.length > 0) {
      allCities.push(...chunk);
      page++;
    } else {
      hasMore = false;
    }
  }

  if (allCities.length === 0) {
    console.error('Failed to fetch cities from DB or no cities found.');
    return;
  }

  // Get cities that already have crime data
  const { data: existingData } = await supabase
    .from('city_safety')
    .select('fips_code')
    .not('violent_crime_rate', 'is', null);

  const existingFips = new Set(existingData?.map(d => d.fips_code) || []);
  
  const citiesToProcess = allCities.filter(c => !existingFips.has(c.fips_code));
  
  console.log(`📊 Found ${allCities.length} total cities.`);
  console.log(`⏭️  Skipping ${existingFips.size} already processed.`);
  console.log(`🚀 Processing ${citiesToProcess.length} cities...`);
  
  if (citiesToProcess.length === 0) {
    console.log('✅ All cities processed!');
    return;
  }

  // Group by state
  const byState: Record<string, typeof citiesToProcess> = {};
  for (const city of citiesToProcess) {
    if (!byState[city.state_code]) byState[city.state_code] = [];
    byState[city.state_code].push(city);
  }

  let matched = 0;
  let totalProcessed = 0;
  let rateLimited = false;

  for (const [stateCode, stateCities] of Object.entries(byState)) {
    if (rateLimited) break;

    console.log(`\n📍 ${stateCode}: Fetching agencies...`);
    const agencies = await getStateAgencies(stateCode);
    
    if (agencies.length === 0 && apiCalls > 10) {
       console.log('No agencies found. Might be rate limited.');
    }

    // Filter only police departments / sheriff
    const policeAgencies = agencies.filter(a => 
      a.agency_type_name === 'City' || 
      a.agency_type_name === 'County'
    );

    for (const city of stateCities) {
      if (rateLimited) break;

      totalProcessed++;
      const cityNameLower = city.name.toLowerCase();
      
      // Try to find matching agency
      const matchedAgency = policeAgencies.find(a =>
        a.city_name?.toLowerCase() === cityNameLower ||
        a.agency_name?.toLowerCase() === `${cityNameLower} police department` ||
        a.agency_name?.toLowerCase().startsWith(cityNameLower)
      );

      if (matchedAgency) {
        process.stdout.write(`   [${totalProcessed}/${citiesToProcess.length}] ${city.name}... `);
        
        const crimeData = await getAgencyCrimeData(matchedAgency.ori);
        
        if (crimeData === 'RATE_LIMIT') {
          rateLimited = true;
          break;
        }

        if (crimeData) {
          const rates = computeCrimeRates(crimeData as CrimeEstimate);
          
          await supabase.from('city_safety').update({
            violent_crime_rate: rates.violent_crime_rate,
            property_crime_rate: rates.property_crime_rate,
            total_crime_rate: rates.total_crime_rate,
            crime_breakdown: rates.crime_breakdown,
            safety_score: rates.safety_score,
            crime_trend: rates.crime_trend
          }).eq('fips_code', city.fips_code);
          
          console.log(`✅ mapped to ${matchedAgency.agency_name}`);
          matched++;
        } else {
          // No data for this agency for 2022
          console.log(`⚠️  no 2022 data for ${matchedAgency.agency_name}`);
        }
      }
    }
  }

  console.log('\n==============================');
  console.log(`📊 FBI Crime ETL Run Complete`);
  console.log(`   Processed: ${totalProcessed}`);
  console.log(`   Matched: ${matched}`);
  console.log(`   API Calls Made: ${apiCalls}`);
  
  if (rateLimited) {
    console.log('\n🛑 STOPPED: API Rate Limit Hit (1,000 requests/hour).');
    console.log('   Run this script again in an hour to resume where it left off!');
  } else {
    console.log('\n✅ All Done!');
  }
}

// Run if called directly
if (require.main === module) {
  runCrimeETL().catch(console.error);
}

export { runCrimeETL };
