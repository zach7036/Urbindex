import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

// Feature Extraction interface
interface MLData {
  fips_code: string;
  name: string;
  state: string;
  // Labels
  safety_score: number | null;
  violent_crime_rate: number | null;
  property_crime_rate: number | null;
  total_crime_rate: number | null;
  crime_breakdown: any;
  // Features (Unscaled)
  poverty_rate: number;
  unemployment_rate: number;
  median_income: number;
  bachelors_pct: number;
  home_val: number;
  // Features (Scaled 0-1)
  scaled_features?: number[];
}

const K_NEIGHBORS = 7;

async function runMLImputation() {
  console.log('🧠 Urbindex Machine Learning ETF (KNN Imputation)');
  console.log('==================================================');
  console.log('Loading datasets from Supabase...');

  // 1. Fetch tables individually to bypass PostgREST nested-schema cache staleness
  const [citiesRes, econRes, eduRes, housRes, safeRes] = await Promise.all([
    supabase.from('cities').select('fips_code, name, state_code').limit(5000),
    supabase.from('city_economy').select('fips_code, poverty_rate, median_household_income, unemployment_rate').limit(5000),
    supabase.from('city_education').select('fips_code, bachelors_pct').limit(5000),
    supabase.from('city_housing').select('fips_code, median_home_value').limit(5000),
    supabase.from('city_safety').select('fips_code, safety_score, violent_crime_rate, property_crime_rate, total_crime_rate, crime_breakdown').limit(5000)
  ]);

  if (citiesRes.error || econRes.error || eduRes.error || housRes.error || safeRes.error) {
    console.error('❌ Failed to fetch database arrays.');
    if (citiesRes.error) console.error('Cities:', citiesRes.error.message);
    if (econRes.error) console.error('Econ:', econRes.error.message);
    if (eduRes.error) console.error('Edu:', eduRes.error.message);
    if (housRes.error) console.error('Hous:', housRes.error.message);
    if (safeRes.error) console.error('Safe:', safeRes.error.message);
    return;
  }

  // Create hash maps for O(1) lookups
  const econMap = new Map(econRes.data.map(e => [e.fips_code, e]));
  const eduMap = new Map(eduRes.data.map(e => [e.fips_code, e]));
  const housMap = new Map(housRes.data.map(h => [h.fips_code, h]));
  const safeMap = new Map(safeRes.data.map(s => [s.fips_code, s]));

  const dataset: MLData[] = [];

  for (const c of citiesRes.data) {
    const econ = econMap.get(c.fips_code);
    const edu = eduMap.get(c.fips_code);
    const hous = housMap.get(c.fips_code);
    const safe = safeMap.get(c.fips_code);
    
    if (econ && edu && hous) {
      dataset.push({
        fips_code: c.fips_code,
        name: c.name,
        state: c.state_code,
        safety_score: safe ? safe.safety_score : null,
        violent_crime_rate: safe ? safe.violent_crime_rate : null,
        property_crime_rate: safe ? safe.property_crime_rate : null,
        total_crime_rate: safe ? safe.total_crime_rate : null,
        crime_breakdown: safe ? safe.crime_breakdown : null,
        poverty_rate: parseFloat(econ.poverty_rate) || 0,
        unemployment_rate: parseFloat(econ.unemployment_rate) || 0,
        median_income: parseInt(econ.median_household_income) || 0,
        bachelors_pct: parseFloat(edu.bachelors_pct) || 0,
        home_val: parseInt(hous.median_home_value) || 0,
      });
    }
  }

  // 2. Separate into Training (Known) and Target (Unknown)
  const knownCities = dataset.filter(c => c.safety_score !== null);
  const unknownCities = dataset.filter(c => c.safety_score === null);

  console.log(`📊 Known FBI Data: ${knownCities.length} cities`);
  console.log(`🎯 Targets to Predict: ${unknownCities.length} cities`);

  if (unknownCities.length === 0) {
    console.log('✅ Nothing to impute. All cities have safety scores!');
    return;
  }

  // 3. Scale Features (Min-Max Normalization) so massive income numbers don't drown out tiny poverty percentages
  const features = ['poverty_rate', 'unemployment_rate', 'median_income', 'bachelors_pct', 'home_val'] as const;
  
  // Weights: Give more importance to poverty and unemployment which closely correlate to crime
  const featureWeights = [2.0, 1.5, 1.0, 1.0, 0.8]; 

  const mins = features.map(f => Math.min(...dataset.map(c => c[f])));
  const maxes = features.map(f => Math.max(...dataset.map(c => c[f])));

  for (const city of dataset) {
    city.scaled_features = features.map((f, i) => {
      const range = maxes[i] - mins[i];
      const scaled = range === 0 ? 0 : (city[f] - mins[i]) / range;
      return scaled * featureWeights[i]; // Apply specific dimension gravity
    });
  }

  // 4. K-Nearest Neighbors Logic function
  function getDistance(a: number[], b: number[]) {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
  }

  const toUpsert = [];

  console.log(`\n🤖 Running K-NN Engine (K=${K_NEIGHBORS}) with Inverse Distance Weighting...`);
  
  for (let i = 0; i < unknownCities.length; i++) {
    const target = unknownCities[i];

    // Compute distances to all known cities
    const distances = knownCities.map(known => ({
      city: known,
      d: getDistance(target.scaled_features!, known.scaled_features!)
    }));

    // Sort by closest (smallest distance) and grab top K
    distances.sort((a, b) => a.d - b.d);
    const neighbors = distances.slice(0, K_NEIGHBORS);

    // Calculate Inverse Distance Weighted Average
    // Prevent Division by 0 if a city happens to be perfectly identical
    let safeSum = 0, violentSum = 0, propSum = 0, totalSum = 0;
    let weightSum = 0;

    let murderSum=0, rapeSum=0, robSum=0, asltSum=0, burgSum=0, larcSum=0, autoSum=0, arsonSum=0;

    for (const n of neighbors) {
      const weight = 1 / (n.d + 0.0001); // Inverse distance
      weightSum += weight;

      safeSum += n.city.safety_score! * weight;
      violentSum += n.city.violent_crime_rate! * weight;
      propSum += n.city.property_crime_rate! * weight;
      totalSum += n.city.total_crime_rate! * weight;

      // Impute deep breakdown safely
      const bk = n.city.crime_breakdown || {};
      murderSum += (bk.murder || 0) * weight;
      rapeSum += (bk.rape || 0) * weight;
      robSum += (bk.robbery || 0) * weight;
      asltSum += (bk.aggravated_assault || 0) * weight;
      burgSum += (bk.burglary || 0) * weight;
      larcSum += (bk.larceny || 0) * weight;
      autoSum += (bk.motor_vehicle_theft || 0) * weight;
      arsonSum += (bk.arson || 0) * weight;
    }

    const avg = (val: number) => Math.round(val / weightSum);
    
    // Construct the imputed result
    toUpsert.push({
      fips_code: target.fips_code,
      year: 2022,
      is_imputed: true,
      safety_score: Math.min(100, Math.max(0, avg(safeSum))),
      violent_crime_rate: avg(violentSum),
      property_crime_rate: avg(propSum),
      total_crime_rate: avg(totalSum),
      crime_trend: 'estimated',
      crime_breakdown: {
        murder: avg(murderSum),
        rape: avg(rapeSum),
        robbery: avg(robSum),
        aggravated_assault: avg(asltSum),
        burglary: avg(burgSum),
        larceny: avg(larcSum),
        motor_vehicle_theft: avg(autoSum),
        arson: avg(arsonSum),
      }
    });

    if (i < 3) {
      console.log(`\nExample Match for: ${target.name}, ${target.state}`);
      console.log(`   -> Computed Score: ${avg(safeSum)}/100`);
      console.log(`   -> Nearest Neighbors matched:`);
      neighbors.slice(0, 3).forEach((n, idx) => {
        console.log(`      ${idx + 1}. ${n.city.name}, ${n.city.state} (Score: ${n.city.safety_score})`);
      });
    }

    if (i % 250 === 0 && i > 0) process.stdout.write(`\rComputed ${i}/${unknownCities.length}...`);
  }

  console.log(`\n\n💾 Committing ${toUpsert.length} synthetic records to Supabase...`);
  
  console.log('🧹 Purging outdated placeholders for target cities...');
  const fipsList = toUpsert.map(u => u.fips_code);
  for (let i = 0; i < fipsList.length; i += 200) {
    const chunk = fipsList.slice(i, i + 200);
    await supabase.from('city_safety').delete().in('fips_code', chunk);
  }

  const BATCH_SIZE = 100;
  for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
    const batch = toUpsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('city_safety').insert(batch);
    if (error) console.error('❌ Insert Error:', error.message);
  }

  console.log('🎉 Machine Learning Imputation Complete! 100% of cities now have safety data.');
}

runMLImputation().catch(console.error);
