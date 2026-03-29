import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { createServiceClient } from '@/lib/supabase';
import { CityProfile } from '@/lib/types';
import CityProfileClient from './CityProfileClient';
import { formatNumber, STATE_NAMES, slugify } from '@/lib/utils';

interface PageProps {
  params: Promise<{ state: string; slug: string }>;
}

async function getCityProfile(stateSlug: string, citySlug: string): Promise<CityProfile | null> {
  const supabase = createServiceClient();
  
  // Find the exact state code that matches the slug
  const stateEntry = Object.entries(STATE_NAMES).find(([code, name]) => slugify(name) === stateSlug);
  const stateCode = stateEntry ? stateEntry[0] : null;

  if (!stateCode) return null;

  // Fetch city core - querying by BOTH state_code and slug prevents PostgREST multiple rows crash
  const { data: cityData, error: cityError } = await supabase
    .from('cities')
    .select('*')
    .eq('state_code', stateCode)
    .eq('slug', citySlug)
    .single();

  if (cityError || !cityData) return null;
  const fips = cityData.fips_code;

  // Concurrent fetch of all architecture
  const [demoRes, econRes, housRes, climRes, safeRes, eduRes, livRes, compRes] = await Promise.all([
    supabase.from('city_demographics').select('*').eq('fips_code', fips).order('year', { ascending: false }).limit(1).single(),
    supabase.from('city_economy').select('*').eq('fips_code', fips).order('year', { ascending: false }).limit(1).single(),
    supabase.from('city_housing').select('*').eq('fips_code', fips).order('year', { ascending: false }).limit(1).single(),
    supabase.from('city_climate').select('*').eq('fips_code', fips).order('id', { ascending: false }).limit(1).single(),
    supabase.from('city_safety').select('*').eq('fips_code', fips).order('id', { ascending: false }).limit(1).single(),
    supabase.from('city_education').select('*').eq('fips_code', fips).order('id', { ascending: false }).limit(1).single(),
    supabase.from('city_livability').select('*').eq('fips_code', fips).order('id', { ascending: false }).limit(1).single(),
    supabase.from('city_computed_scores').select('*').eq('fips_code', fips).order('id', { ascending: false }).limit(1).single(),
  ]);

  return {
    city: cityData,
    demographics: demoRes.data || { total_population: cityData.population },
    economy: econRes.data || {},
    housing: housRes.data || {},
    climate: climRes.data || {},
    safety: safeRes.data || {},
    education: eduRes.data || {},
    livability: livRes.data || {},
    computed_scores: compRes.data || undefined
  } as unknown as CityProfile; // Fallbacks applied internally by UI safely
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { state, slug } = await params;
  const profile = await getCityProfile(state, slug);
  
  if (!profile) return { title: 'City Not Found | Urbindex' };

  return {
    title: `${profile.city.name}, ${profile.city.state_code} — City Profile | Urbindex`,
    description: `Explore ${profile.city.name}, ${profile.city.state}: population ${formatNumber(profile.demographics?.total_population || 0)}, and more. Comprehensive city data and analytics.`,
  };
}

export async function generateStaticParams() {
  return []; // SSR on-demand for massive DB scale
}

export default async function CityProfilePage({ params }: PageProps) {
  const { state, slug } = await params;
  const profile = await getCityProfile(state, slug);

  if (!profile) {
    notFound();
  }

  return <CityProfileClient profile={profile} />;
}
