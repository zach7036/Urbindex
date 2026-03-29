/**
 * Urbindex — Census ACS ETL Script
 * 
 * Fetches demographics, income, housing, education, and commute data
 * from the US Census Bureau American Community Survey (ACS) API.
 * Writes directly to Supabase.
 * 
 * API: https://api.census.gov/data/2023/acs/acs5
 * 
 * Usage: 
 *   npx ts-node --project tsconfig.scripts.json -r tsconfig-paths/register scripts/etl/census-acs.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { createClient } from '@supabase/supabase-js';

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const BASE_URL = 'https://api.census.gov/data/2022/acs/acs5';
const MIN_POPULATION = 10000;

// Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

// State FIPS → abbreviation + full name
const STATE_INFO: Record<string, { code: string; name: string }> = {
  '01': { code: 'AL', name: 'Alabama' }, '02': { code: 'AK', name: 'Alaska' },
  '04': { code: 'AZ', name: 'Arizona' }, '05': { code: 'AR', name: 'Arkansas' },
  '06': { code: 'CA', name: 'California' }, '08': { code: 'CO', name: 'Colorado' },
  '09': { code: 'CT', name: 'Connecticut' }, '10': { code: 'DE', name: 'Delaware' },
  '11': { code: 'DC', name: 'District of Columbia' }, '12': { code: 'FL', name: 'Florida' },
  '13': { code: 'GA', name: 'Georgia' }, '15': { code: 'HI', name: 'Hawaii' },
  '16': { code: 'ID', name: 'Idaho' }, '17': { code: 'IL', name: 'Illinois' },
  '18': { code: 'IN', name: 'Indiana' }, '19': { code: 'IA', name: 'Iowa' },
  '20': { code: 'KS', name: 'Kansas' }, '21': { code: 'KY', name: 'Kentucky' },
  '22': { code: 'LA', name: 'Louisiana' }, '23': { code: 'ME', name: 'Maine' },
  '24': { code: 'MD', name: 'Maryland' }, '25': { code: 'MA', name: 'Massachusetts' },
  '26': { code: 'MI', name: 'Michigan' }, '27': { code: 'MN', name: 'Minnesota' },
  '28': { code: 'MS', name: 'Mississippi' }, '29': { code: 'MO', name: 'Missouri' },
  '30': { code: 'MT', name: 'Montana' }, '31': { code: 'NE', name: 'Nebraska' },
  '32': { code: 'NV', name: 'Nevada' }, '33': { code: 'NH', name: 'New Hampshire' },
  '34': { code: 'NJ', name: 'New Jersey' }, '35': { code: 'NM', name: 'New Mexico' },
  '36': { code: 'NY', name: 'New York' }, '37': { code: 'NC', name: 'North Carolina' },
  '38': { code: 'ND', name: 'North Dakota' }, '39': { code: 'OH', name: 'Ohio' },
  '40': { code: 'OK', name: 'Oklahoma' }, '41': { code: 'OR', name: 'Oregon' },
  '42': { code: 'PA', name: 'Pennsylvania' }, '44': { code: 'RI', name: 'Rhode Island' },
  '45': { code: 'SC', name: 'South Carolina' }, '46': { code: 'SD', name: 'South Dakota' },
  '47': { code: 'TN', name: 'Tennessee' }, '48': { code: 'TX', name: 'Texas' },
  '49': { code: 'UT', name: 'Utah' }, '50': { code: 'VT', name: 'Vermont' },
  '51': { code: 'VA', name: 'Virginia' }, '53': { code: 'WA', name: 'Washington' },
  '54': { code: 'WV', name: 'West Virginia' }, '55': { code: 'WI', name: 'Wisconsin' },
  '56': { code: 'WY', name: 'Wyoming' },
};

// ACS variables
const DEMOGRAPHICS_VARS = [
  'NAME',
  'B01003_001E', // Total population
  'B01002_001E', // Median age
  'B01001_002E', // Male
  'B01001_026E', // Female
  'B03002_003E', // White alone (not Hispanic)
  'B03002_004E', // Black alone
  'B03002_012E', // Hispanic/Latino
  'B03002_006E', // Asian alone
  'B03002_005E', // Native American
  'B03002_007E', // Pacific Islander
  'B03002_009E', // Two or more
  'B05002_013E', // Foreign born
  'B11001_001E', // Total households
  'B25010_001E', // Avg household size
].join(',');

const ECONOMY_VARS = [
  'B19013_001E', // Median household income
  'B19301_001E', // Per capita income
  'B19025_001E', // Mean household income
  'B17001_001E', // Total for poverty
  'B17001_002E', // Below poverty
  'B23025_003E', // In civilian labor force
  'B23025_005E', // Unemployed
  'B23025_002E', // In labor force total
].join(',');

const HOUSING_VARS = [
  'B25077_001E', // Median home value
  'B25064_001E', // Median gross rent
  'B25003_001E', // Total housing tenure
  'B25003_002E', // Owner occupied
  'B25003_003E', // Renter occupied
  'B25002_001E', // Total housing units
  'B25002_003E', // Vacant
  'B25018_001E', // Median rooms
  'B25035_001E', // Median year built
].join(',');

const EDUCATION_VARS = [
  'B15003_001E', // Total 25+ pop
  'B15003_017E', // HS diploma
  'B15003_018E', // GED
  'B15003_022E', // Bachelor's
  'B15003_023E', // Master's
  'B15003_024E', // Professional
  'B15003_025E', // Doctorate
].join(',');

const COMMUTE_VARS = [
  'B08301_001E', // Total commuters
  'B08301_003E', // Drove alone
  'B08301_004E', // Carpooled
  'B08301_010E', // Public transit
  'B08301_019E', // Walked
  'B08301_021E', // Worked from home
  'B08136_001E', // Aggregate travel time (minutes)
].join(',');

async function fetchCensusData(variables: string, stateFips: string): Promise<string[][]> {
  const url = `${BASE_URL}?get=${variables}&for=place:*&in=state:${stateFips}${CENSUS_API_KEY ? `&key=${CENSUS_API_KEY}` : ''}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  Census API error for state ${stateFips}: ${response.status}`);
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error(`  Failed to fetch state ${stateFips}:`, error);
    return [];
  }
}

function parseNum(val: string | undefined): number {
  if (!val || val === '' || val === 'null' || val === '-666666666') return 0;
  return parseInt(val) || 0;
}

function parseFloat2(val: string | undefined): number {
  if (!val || val === '' || val === 'null' || val === '-666666666') return 0;
  return parseFloat(val) || 0;
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+(city|town|village|borough|cdp|municipality),?\s*/gi, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCityClass(pop: number): string {
  if (pop >= 250000) return 'large';
  if (pop >= 100000) return 'mid';
  if (pop >= 50000) return 'small';
  return 'micro';
}

async function runCensusETL() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     URBINDEX — Census ACS ETL            ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  if (!CENSUS_API_KEY) {
    console.error('❌ CENSUS_API_KEY not set. Get one at: https://api.census.gov/data/key_signup.html');
    return;
  }

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Supabase credentials not set.');
    return;
  }

  console.log(`Census API Key: ✅`);
  console.log(`Supabase: ✅ ${supabaseUrl}`);
  console.log(`Min population: ${MIN_POPULATION.toLocaleString()}`);
  console.log('');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE 1: Fetch demographics (identifies qualifying cities)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('━'.repeat(50));
  console.log('PHASE 1: Demographics\n');

  const allCities: Record<string, Record<string, string>> = {};
  let stateCount = 0;

  for (const [fips, info] of Object.entries(STATE_INFO)) {
    stateCount++;
    process.stdout.write(`  [${stateCount}/${Object.keys(STATE_INFO).length}] ${info.code}...`);
    const data = await fetchCensusData(DEMOGRAPHICS_VARS, fips);

    if (data.length <= 1) { console.log(' no data'); continue; }

    const headers = data[0];
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = data[i][idx]; });

      const population = parseNum(row['B01003_001E']);
      if (population < MIN_POPULATION) continue;

      const placeFips = `${fips}${row['place']}`;
      const rawName = row['NAME'] || '';
      const name = rawName.replace(/,\s*.+$/, '').replace(/\s+(city|town|village|borough|CDP|municipality)$/i, '');

      allCities[placeFips] = {
        ...row,
        fips_code: placeFips,
        name,
        state_code: info.code,
        state_name: info.name,
        state_fips: fips,
        slug: slugify(name),
        population: String(population),
      };
      count++;
    }
    console.log(` ${count} cities`);
    await new Promise(r => setTimeout(r, 200));
  }

  const totalCities = Object.keys(allCities).length;
  console.log(`\n✅ Found ${totalCities} cities with pop > ${MIN_POPULATION.toLocaleString()}\n`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE 2: Fetch economy data
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('━'.repeat(50));
  console.log('PHASE 2: Economy\n');
  stateCount = 0;
  for (const [fips, info] of Object.entries(STATE_INFO)) {
    stateCount++;
    process.stdout.write(`  [${stateCount}/${Object.keys(STATE_INFO).length}] ${info.code}...`);
    const data = await fetchCensusData(ECONOMY_VARS, fips);
    if (data.length > 1) {
      const headers = data[0];
      let matched = 0;
      for (let i = 1; i < data.length; i++) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = data[i][idx]; });
        const placeFips = `${fips}${row['place']}`;
        if (allCities[placeFips]) { Object.assign(allCities[placeFips], row); matched++; }
      }
      console.log(` ${matched} matched`);
    } else { console.log(' no data'); }
    await new Promise(r => setTimeout(r, 200));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE 3: Fetch housing data
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n' + '━'.repeat(50));
  console.log('PHASE 3: Housing\n');
  stateCount = 0;
  for (const [fips, info] of Object.entries(STATE_INFO)) {
    stateCount++;
    process.stdout.write(`  [${stateCount}/${Object.keys(STATE_INFO).length}] ${info.code}...`);
    const data = await fetchCensusData(HOUSING_VARS, fips);
    if (data.length > 1) {
      const headers = data[0];
      let matched = 0;
      for (let i = 1; i < data.length; i++) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = data[i][idx]; });
        const placeFips = `${fips}${row['place']}`;
        if (allCities[placeFips]) { Object.assign(allCities[placeFips], row); matched++; }
      }
      console.log(` ${matched} matched`);
    } else { console.log(' no data'); }
    await new Promise(r => setTimeout(r, 200));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE 4: Fetch education data
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n' + '━'.repeat(50));
  console.log('PHASE 4: Education\n');
  stateCount = 0;
  for (const [fips, info] of Object.entries(STATE_INFO)) {
    stateCount++;
    process.stdout.write(`  [${stateCount}/${Object.keys(STATE_INFO).length}] ${info.code}...`);
    const data = await fetchCensusData(EDUCATION_VARS, fips);
    if (data.length > 1) {
      const headers = data[0];
      let matched = 0;
      for (let i = 1; i < data.length; i++) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = data[i][idx]; });
        const placeFips = `${fips}${row['place']}`;
        if (allCities[placeFips]) { Object.assign(allCities[placeFips], row); matched++; }
      }
      console.log(` ${matched} matched`);
    } else { console.log(' no data'); }
    await new Promise(r => setTimeout(r, 200));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE 5: Fetch commute data
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n' + '━'.repeat(50));
  console.log('PHASE 5: Commute\n');
  stateCount = 0;
  for (const [fips, info] of Object.entries(STATE_INFO)) {
    stateCount++;
    process.stdout.write(`  [${stateCount}/${Object.keys(STATE_INFO).length}] ${info.code}...`);
    const data = await fetchCensusData(COMMUTE_VARS, fips);
    if (data.length > 1) {
      const headers = data[0];
      let matched = 0;
      for (let i = 1; i < data.length; i++) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = data[i][idx]; });
        const placeFips = `${fips}${row['place']}`;
        if (allCities[placeFips]) { Object.assign(allCities[placeFips], row); matched++; }
      }
      console.log(` ${matched} matched`);
    } else { console.log(' no data'); }
    await new Promise(r => setTimeout(r, 200));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE 6: Write to Supabase
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n' + '━'.repeat(50));
  console.log('PHASE 6: Writing to Supabase\n');

  const cities = Object.values(allCities);
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < cities.length; i++) {
    const c = cities[i];
    const pop = parseNum(c.population);
    const totalPop25 = parseNum(c['B15003_001E']);
    const totalCommuters = parseNum(c['B08301_001E']);
    const laborForce = parseNum(c['B23025_002E']);
    const unemployed = parseNum(c['B23025_005E']);
    const povertyTotal = parseNum(c['B17001_001E']);
    const povertyBelow = parseNum(c['B17001_002E']);
    const totalTenure = parseNum(c['B25003_001E']);
    const ownerOcc = parseNum(c['B25003_002E']);
    const totalUnits = parseNum(c['B25002_001E']);
    const vacant = parseNum(c['B25002_003E']);
    const medianIncome = parseNum(c['B19013_001E']);
    const medianHome = parseNum(c['B25077_001E']);

    if (i % 100 === 0) {
      console.log(`  [${i + 1}/${cities.length}] ${c.name}, ${c.state_code}...`);
    }

    // 1. Upsert city record
    const { error: cityErr } = await supabase.from('cities').upsert({
      fips_code: c.fips_code,
      name: c.name,
      state: c.state_name,
      state_code: c.state_code,
      county: '',
      county_fips: '',
      latitude: 0,
      longitude: 0,
      population: pop,
      city_class: getCityClass(pop),
      slug: c.slug,
      timezone: '',
    }, { onConflict: 'fips_code' });

    if (cityErr) { errors++; continue; }

    // 2. Demographics
    const male = parseNum(c['B01001_002E']);
    const female = parseNum(c['B01001_026E']);
    const white = parseNum(c['B03002_003E']);
    const black = parseNum(c['B03002_004E']);
    const hispanic = parseNum(c['B03002_012E']);
    const asian = parseNum(c['B03002_006E']);
    const nativeAm = parseNum(c['B03002_005E']);
    const pacific = parseNum(c['B03002_007E']);
    const twoPlus = parseNum(c['B03002_009E']);
    const otherRace = Math.max(0, pop - white - black - hispanic - asian - nativeAm - pacific - twoPlus);

    await supabase.from('city_demographics').upsert({
      fips_code: c.fips_code,
      year: 2022,
      total_population: pop,
      population_density: 0,
      median_age: parseFloat2(c['B01002_001E']),
      male_pct: pct(male, pop),
      female_pct: pct(female, pop),
      race_ethnicity: {
        white: pct(white, pop),
        black: pct(black, pop),
        hispanic: pct(hispanic, pop),
        asian: pct(asian, pop),
        native_american: pct(nativeAm, pop),
        pacific_islander: pct(pacific, pop),
        two_or_more: pct(twoPlus, pop),
        other: pct(otherRace, pop),
      },
      foreign_born_pct: pct(parseNum(c['B05002_013E']), pop),
      median_household_size: parseFloat2(c['B25010_001E']),
      population_growth_rate: 0,
      veterans_pct: 0,
      disability_pct: 0,
    }, { onConflict: 'fips_code,year' });

    // 3. Economy
    await supabase.from('city_economy').upsert({
      fips_code: c.fips_code,
      year: 2022,
      median_household_income: medianIncome,
      per_capita_income: parseNum(c['B19301_001E']),
      mean_household_income: parseNum(c['B19025_001E']),
      unemployment_rate: laborForce > 0 ? pct(unemployed, laborForce) : 0,
      poverty_rate: povertyTotal > 0 ? pct(povertyBelow, povertyTotal) : 0,
      labor_force_participation: pop > 0 ? pct(laborForce, pop) : 0,
      gini_coefficient: 0,
      job_growth_rate: 0,
      top_industries: [],
      income_brackets: [],
    }, { onConflict: 'fips_code,year' });

    // 4. Housing
    await supabase.from('city_housing').upsert({
      fips_code: c.fips_code,
      year: 2022,
      median_home_value: medianHome,
      median_rent: parseNum(c['B25064_001E']),
      homeownership_rate: totalTenure > 0 ? pct(ownerOcc, totalTenure) : 0,
      vacancy_rate: totalUnits > 0 ? pct(vacant, totalUnits) : 0,
      housing_units: totalUnits,
      median_rooms: parseFloat2(c['B25018_001E']),
      median_year_built: parseNum(c['B25035_001E']),
      price_to_income_ratio: medianIncome > 0 ? Math.round((medianHome / medianIncome) * 10) / 10 : 0,
      rent_to_income_ratio: medianIncome > 0 ? Math.round((parseNum(c['B25064_001E']) * 12 / medianIncome) * 1000) / 10 : 0,
      housing_cost_burden_pct: 0,
      yoy_appreciation: 0,
    }, { onConflict: 'fips_code,year' });

    // 5. Education
    const hsGrad = parseNum(c['B15003_017E']) + parseNum(c['B15003_018E']);
    const bachelors = parseNum(c['B15003_022E']);
    const masters = parseNum(c['B15003_023E']);
    const professional = parseNum(c['B15003_024E']);
    const doctorate = parseNum(c['B15003_025E']);
    const graduate = masters + professional + doctorate;

    await supabase.from('city_education').upsert({
      fips_code: c.fips_code,
      year: 2022,
      high_school_grad_pct: totalPop25 > 0 ? pct(hsGrad + bachelors + graduate, totalPop25) : 0,
      bachelors_pct: totalPop25 > 0 ? pct(bachelors, totalPop25) : 0,
      graduate_pct: totalPop25 > 0 ? pct(graduate, totalPop25) : 0,
      school_enrollment: 0,
      student_teacher_ratio: 0,
      school_expenditure_per_pupil: 0,
      top_schools: [],
      universities: [],
    }, { onConflict: 'fips_code,year' });

    // 6. Livability (commute data)
    const droveAlone = parseNum(c['B08301_003E']);
    const carpooled = parseNum(c['B08301_004E']);
    const transit = parseNum(c['B08301_010E']);
    const walked = parseNum(c['B08301_019E']);
    const wfh = parseNum(c['B08301_021E']);
    const otherCommute = Math.max(0, totalCommuters - droveAlone - carpooled - transit - walked - wfh);
    const aggTravelTime = parseNum(c['B08136_001E']);
    const avgCommute = totalCommuters > 0 ? Math.round((aggTravelTime / totalCommuters) * 10) / 10 : 0;

    await supabase.from('city_livability').upsert({
      fips_code: c.fips_code,
      walkscore: 0,
      transit_score: 0,
      bike_score: 0,
      broadband_pct: 0,
      commute_time_avg: avgCommute,
      commute_mode: {
        drove_alone: totalCommuters > 0 ? pct(droveAlone, totalCommuters) : 0,
        carpooled: totalCommuters > 0 ? pct(carpooled, totalCommuters) : 0,
        public_transit: totalCommuters > 0 ? pct(transit, totalCommuters) : 0,
        walked: totalCommuters > 0 ? pct(walked, totalCommuters) : 0,
        worked_from_home: totalCommuters > 0 ? pct(wfh, totalCommuters) : 0,
        other: totalCommuters > 0 ? pct(otherCommute, totalCommuters) : 0,
      },
      aqi_avg: 0,
      parks_per_capita: 0,
      hospitals_per_capita: 0,
      grocery_stores_per_capita: 0,
    }, { onConflict: 'fips_code' });

    inserted++;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SUMMARY
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n' + '━'.repeat(50));
  console.log('📊 ETL Summary\n');

  const { data: dbCities } = await supabase
    .from('cities')
    .select('city_class')
    .order('population', { ascending: false });

  const total = dbCities?.length || 0;
  const large = dbCities?.filter(c => c.city_class === 'large').length || 0;
  const mid = dbCities?.filter(c => c.city_class === 'mid').length || 0;
  const small = dbCities?.filter(c => c.city_class === 'small').length || 0;
  const micro = dbCities?.filter(c => c.city_class === 'micro').length || 0;

  console.log(`  Total cities in DB: ${total}`);
  console.log(`  Large (250K+):   ${large}`);
  console.log(`  Mid (100K-250K): ${mid}`);
  console.log(`  Small (50K-100K): ${small}`);
  console.log(`  Micro (10K-50K): ${micro}`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Errors: ${errors}`);
  console.log('\n✅ Census ETL complete!\n');

  return cities;
}

// Run if called directly
if (require.main === module) {
  runCensusETL().catch(console.error);
}

export { runCensusETL };
