'use server';

import { createServiceClient } from '@/lib/supabase';
import { CityProfile } from '@/lib/types';

export async function fetchCityComparison(fipsCodes: string[]): Promise<CityProfile[]> {
  const supabase = createServiceClient();
  const profiles: CityProfile[] = [];

  for (const fips of fipsCodes) {
    const [cityRes, demoRes, econRes, housRes, climRes, safeRes, eduRes, livRes, compRes] = await Promise.all([
      supabase.from('cities').select('*').eq('fips_code', fips).single(),
      supabase.from('city_demographics').select('*').eq('fips_code', fips).order('year', { ascending: false }).limit(1).single(),
      supabase.from('city_economy').select('*').eq('fips_code', fips).order('year', { ascending: false }).limit(1).single(),
      supabase.from('city_housing').select('*').eq('fips_code', fips).order('year', { ascending: false }).limit(1).single(),
      supabase.from('city_climate').select('*').eq('fips_code', fips).order('id', { ascending: false }).limit(1).single(),
      supabase.from('city_safety').select('*').eq('fips_code', fips).order('id', { ascending: false }).limit(1).single(),
      supabase.from('city_education').select('*').eq('fips_code', fips).order('id', { ascending: false }).limit(1).single(),
      supabase.from('city_livability').select('*').eq('fips_code', fips).order('id', { ascending: false }).limit(1).single(),
      supabase.from('city_computed_scores').select('*').eq('fips_code', fips).order('id', { ascending: false }).limit(1).single(),
    ]);

    if (!cityRes.data) continue;

    profiles.push({
      city: cityRes.data,
      demographics: demoRes.data || { total_population: cityRes.data.population },
      economy: econRes.data || {},
      housing: housRes.data || {},
      climate: climRes.data || {},
      safety: safeRes.data || {},
      education: eduRes.data || {},
      livability: livRes.data || {},
      computed_scores: compRes.data || undefined,
    } as unknown as CityProfile);
  }

  return profiles;
}
