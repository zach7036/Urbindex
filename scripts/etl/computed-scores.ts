import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function computeCustomIndices() {
  console.log('📈 Urbindex Phase 3: Custom Scoring Engine');
  console.log('==================================================');

  // 1. Fetch all dependencies
  async function fetchAll(table: string, columns: string) {
    let allData: any[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await supabase.from(table).select(columns).range(page * 1000, (page + 1) * 1000 - 1);
      if (error) {
        console.error(`❌ Error fetching ${table}:`, error.message);
        break;
      }
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < 1000) break;
      page++;
    }
    return allData;
  }

  console.log('Fetching foundation datasets from Supabase with pagination...');
  try {
    const [citiesRes, demoRes, econRes, housRes, safeRes, livRes, eduRes] = await Promise.all([
      fetchAll('cities', 'fips_code'),
      fetchAll('city_demographics', 'fips_code, population_density'),
      fetchAll('city_economy', 'fips_code, median_household_income, unemployment_rate'),
      fetchAll('city_housing', 'fips_code, median_home_value'),
      fetchAll('city_safety', 'fips_code, safety_score'),
      fetchAll('city_livability', 'fips_code, walkscore'),
      fetchAll('city_education', 'fips_code, bachelors_pct')
    ]);

    const mapData = (arr: any[]) => new Map(arr?.map(a => [a.fips_code, a]) || []);
    const demoMap = mapData(demoRes);
    const econMap = mapData(econRes);
    const housMap = mapData(housRes);
    const safeMap = mapData(safeRes);
    const livMap = mapData(livRes);
    const eduMap = mapData(eduRes);

    const toUpsert = [];

    for (const city of citiesRes) {
      const fips = city.fips_code;
      
      // Fallbacks if data is missing
      const income = econMap.get(fips)?.median_household_income || 0;
      const homeVal = housMap.get(fips)?.median_home_value || 0;
      const unemp = econMap.get(fips)?.unemployment_rate || 5.0;
      
      const bachelors = eduMap.get(fips)?.bachelors_pct || 0;
      const density = demoMap.get(fips)?.population_density || 0;
    
    const safety = safeMap.get(fips)?.safety_score || 50;
    const walk = livMap.get(fips)?.walkscore || 25;

    // --- 1. Affordability Index (0-100) ---
    // Ratio = Home Price / Income. 
    // Ratio of < 3.0 = 100. Ratio of > 10.0 = 0.
    let affordabilityScore = 50;
    if (income > 0 && homeVal > 0) {
      const ratio = homeVal / income;
      affordabilityScore = 100 - ((ratio - 3) * (100 / 7)); // (10-3)=7 slope
    }
    const affordFinal = Math.min(100, Math.max(0, Math.round(affordabilityScore)));

    // Normalize building blocks
    const bachelorsNorm = Math.min(100, (bachelors / 40) * 100); // 40% bachelors = perfect 100
    const densityNorm = Math.min(100, (density / 4000) * 100); // 4000 ppl/sqmi = perfect 100
    const incomeNorm = Math.min(100, (income / 110000) * 100); // $110k income = perfect 100
    let unempNorm = 100 - ((unemp - 2) * 12.5); // 2% unemp = 100, 10% = 0
    unempNorm = Math.min(100, Math.max(0, unempNorm));

    // --- 2. Cultural Density Index (0-100) ---
    // Dense populations, walkable grids, and high education usually signify cultural hubs.
    const cultureScore = (bachelorsNorm * 0.35) + (walk * 0.35) + (densityNorm * 0.30);
    const cultureFinal = Math.min(100, Math.max(0, Math.round(cultureScore)));

    // --- 3. Economic Resilience (0-100) ---
    // Wealthy, educated, low unemployment.
    const econScore = (incomeNorm * 0.4) + (bachelorsNorm * 0.3) + (unempNorm * 0.3);
    const resilientFinal = Math.min(100, Math.max(0, Math.round(econScore)));

    // --- 4. Hidden Gem Score (0-100) ---
    // Finds affordable, highly safe spots that aren't aggressively crowded
    const hiddenGemScore = (safety * 0.35) 
                         + (affordFinal * 0.40) 
                         + (Math.max(0, 100 - densityNorm) * 0.25); // Rewards lower density
    const gemFinal = Math.min(100, Math.max(0, Math.round(hiddenGemScore)));

    // --- 5. OVERALL Livability (0-100) ---
    // Let's make the baseline less punishing.
    // Overall should feel like a typical grading scale, most cities 50-75, best cities 85-98.
    const overallScore = (safety * 0.25) 
                       + (affordFinal * 0.20) 
                       + (resilientFinal * 0.20) 
                       + (cultureFinal * 0.15) 
                       + (walk * 0.20);
                       
    // Apply a slight curve to boost the distribution so it feels like a standard grading curve
    // e.g. An raw overall of 60 gets curved up to ~72. Raw 80 -> 88.
    const curvedLivability = Math.pow(overallScore / 100, 0.7) * 100;
    const livFinal = Math.min(100, Math.max(0, Math.round(curvedLivability)));

    toUpsert.push({
      fips_code: fips,
      economic_resilience: resilientFinal,
      hidden_gem_score: gemFinal,
      cultural_density_index: cultureFinal,
      affordability_index: affordFinal,
      overall_livability: livFinal,
      remote_work_score: 0 // Optional placeholder for future
    });
  }

  // Batch insert into Supabase
  console.log(`\n💾 Committing ${toUpsert.length} Computed Index Scores to Supabase...`);
  const BATCH_SIZE = 150;
  for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
    const batch = toUpsert.slice(i, i + BATCH_SIZE);
    
    // Using standard UPSERT since we set 'fips_code' as unique earlier hopefully, or delete/insert
    // First, let's delete existing for pure REST bypassing of constraints
    const chunkFips = batch.map(b => b.fips_code);
    await supabase.from('city_computed_scores').delete().in('fips_code', chunkFips);
    
    const { error } = await supabase.from('city_computed_scores').insert(batch);
    if (error) {
      console.error('❌ Insert Error:', error.message);
    }
  }

  console.log('🎉 Computed Scoring Engine Executed Successfully!');
  } catch (error) {
    console.error('❌ Failed during computation:', error);
  }
}

computeCustomIndices().catch(console.error);
