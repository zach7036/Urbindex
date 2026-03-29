/**
 * Urbindex — Seed Data → Supabase Loader
 * 
 * Inserts the 8 seed cities into the Supabase database to verify
 * the connection and schema work correctly.
 * 
 * Usage: npx ts-node scripts/etl/seed-to-supabase.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';
import { SEED_CITIES } from '../../src/lib/seed-data';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function seedDatabase() {
  console.log('🌱 Urbindex — Seeding Database');
  console.log('==============================');
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Cities to seed: ${SEED_CITIES.length}\n`);

  for (const profile of SEED_CITIES) {
    const { city, demographics, economy, housing, climate, safety, education, livability } = profile;
    console.log(`📍 ${city.name}, ${city.state_code}...`);

    // 1. Insert city
    const { error: cityError } = await supabase
      .from('cities')
      .upsert({
        fips_code: city.fips_code,
        name: city.name,
        state: city.state,
        state_code: city.state_code,
        county: city.county,
        county_fips: city.county_fips,
        latitude: city.latitude,
        longitude: city.longitude,
        population: city.population,
        city_class: city.city_class,
        slug: city.slug,
        timezone: city.timezone,
      }, { onConflict: 'fips_code' });

    if (cityError) {
      console.error(`  ❌ City insert failed:`, cityError.message);
      continue;
    }
    console.log('  ✅ City record');

    // 2. Demographics
    const { error: demoError } = await supabase
      .from('city_demographics')
      .upsert({
        fips_code: city.fips_code,
        year: 2023,
        total_population: demographics.total_population,
        population_density: demographics.population_density,
        median_age: demographics.median_age,
        male_pct: demographics.male_pct,
        female_pct: demographics.female_pct,
        race_ethnicity: demographics.race_ethnicity,
        foreign_born_pct: demographics.foreign_born_pct,
        median_household_size: demographics.median_household_size,
        population_growth_rate: demographics.population_growth_rate,
        veterans_pct: demographics.veterans_pct,
        disability_pct: demographics.disability_pct,
      }, { onConflict: 'fips_code,year' });

    if (demoError) console.error(`  ❌ Demographics:`, demoError.message);
    else console.log('  ✅ Demographics');

    // 3. Economy
    const { error: econError } = await supabase
      .from('city_economy')
      .upsert({
        fips_code: city.fips_code,
        year: 2023,
        median_household_income: economy.median_household_income,
        per_capita_income: economy.per_capita_income,
        mean_household_income: economy.mean_household_income,
        unemployment_rate: economy.unemployment_rate,
        poverty_rate: economy.poverty_rate,
        labor_force_participation: economy.labor_force_participation,
        gini_coefficient: economy.gini_coefficient,
        job_growth_rate: economy.job_growth_rate,
        top_industries: economy.top_industries,
        income_brackets: economy.income_brackets,
      }, { onConflict: 'fips_code,year' });

    if (econError) console.error(`  ❌ Economy:`, econError.message);
    else console.log('  ✅ Economy');

    // 4. Housing
    const { error: housError } = await supabase
      .from('city_housing')
      .upsert({
        fips_code: city.fips_code,
        year: 2023,
        median_home_value: housing.median_home_value,
        median_rent: housing.median_rent,
        homeownership_rate: housing.homeownership_rate,
        vacancy_rate: housing.vacancy_rate,
        housing_units: housing.housing_units,
        median_rooms: housing.median_rooms,
        median_year_built: housing.median_year_built,
        price_to_income_ratio: housing.price_to_income_ratio,
        rent_to_income_ratio: housing.rent_to_income_ratio,
        housing_cost_burden_pct: housing.housing_cost_burden_pct,
        yoy_appreciation: housing.yoy_appreciation,
      }, { onConflict: 'fips_code,year' });

    if (housError) console.error(`  ❌ Housing:`, housError.message);
    else console.log('  ✅ Housing');

    // 5. Climate
    const { error: climError } = await supabase
      .from('city_climate')
      .upsert({
        fips_code: city.fips_code,
        avg_high_jan: climate.avg_high_jan,
        avg_low_jan: climate.avg_low_jan,
        avg_high_apr: climate.avg_high_apr,
        avg_low_apr: climate.avg_low_apr,
        avg_high_jul: climate.avg_high_jul,
        avg_low_jul: climate.avg_low_jul,
        avg_high_oct: climate.avg_high_oct,
        avg_low_oct: climate.avg_low_oct,
        annual_precipitation: climate.annual_precipitation,
        annual_snowfall: climate.annual_snowfall,
        sunny_days: climate.sunny_days,
        rainy_days: climate.rainy_days,
        days_above_90: climate.days_above_90,
        days_below_32: climate.days_below_32,
        avg_humidity: climate.avg_humidity,
        uv_index: climate.uv_index,
        comfort_index: climate.comfort_index,
      }, { onConflict: 'fips_code' });

    if (climError) console.error(`  ❌ Climate:`, climError.message);
    else console.log('  ✅ Climate');

    // 6. Safety
    const { error: safeError } = await supabase
      .from('city_safety')
      .upsert({
        fips_code: city.fips_code,
        year: 2023,
        violent_crime_rate: safety.violent_crime_rate,
        property_crime_rate: safety.property_crime_rate,
        total_crime_rate: safety.total_crime_rate,
        crime_breakdown: safety.crime_breakdown,
        crime_trend: safety.crime_trend,
        safety_score: safety.safety_score,
      }, { onConflict: 'fips_code,year' });

    if (safeError) console.error(`  ❌ Safety:`, safeError.message);
    else console.log('  ✅ Safety');

    // 7. Education
    const { error: eduError } = await supabase
      .from('city_education')
      .upsert({
        fips_code: city.fips_code,
        year: 2023,
        high_school_grad_pct: education.high_school_grad_pct,
        bachelors_pct: education.bachelors_pct,
        graduate_pct: education.graduate_pct,
        school_enrollment: education.school_enrollment,
        student_teacher_ratio: education.student_teacher_ratio,
        school_expenditure_per_pupil: education.school_expenditure_per_pupil,
        top_schools: education.top_schools,
        universities: education.universities,
      }, { onConflict: 'fips_code,year' });

    if (eduError) console.error(`  ❌ Education:`, eduError.message);
    else console.log('  ✅ Education');

    // 8. Livability
    const { error: livError } = await supabase
      .from('city_livability')
      .upsert({
        fips_code: city.fips_code,
        walkscore: livability.walkscore,
        transit_score: livability.transit_score,
        bike_score: livability.bike_score,
        broadband_pct: livability.broadband_pct,
        commute_time_avg: livability.commute_time_avg,
        commute_mode: livability.commute_mode,
        aqi_avg: livability.aqi_avg,
        parks_per_capita: livability.parks_per_capita,
        hospitals_per_capita: livability.hospitals_per_capita,
        grocery_stores_per_capita: livability.grocery_stores_per_capita,
      }, { onConflict: 'fips_code' });

    if (livError) console.error(`  ❌ Livability:`, livError.message);
    else console.log('  ✅ Livability');

    console.log('');
  }

  // Verify
  const { data: cities, error } = await supabase
    .from('cities')
    .select('name, state_code, population')
    .order('population', { ascending: false });

  if (error) {
    console.error('❌ Verification failed:', error.message);
  } else {
    console.log('📊 Database Verification:');
    console.log(`   ${cities.length} cities in database:`);
    cities.forEach(c => console.log(`   • ${c.name}, ${c.state_code} (pop: ${c.population.toLocaleString()})`));
  }

  console.log('\n✅ Seed complete!');
}

seedDatabase().catch(console.error);
