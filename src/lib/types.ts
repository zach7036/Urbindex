// ============================================================
// Urbindex — Core Data Types
// ============================================================

export interface City {
  fips_code: string;
  name: string;
  state: string;
  state_code: string;
  county: string;
  county_fips: string;
  latitude: number;
  longitude: number;
  population: number;
  city_class: 'large' | 'mid' | 'small' | 'micro';
  slug: string;
  timezone?: string;
}

export interface CityDemographics {
  fips_code: string;
  year: number;
  total_population: number;
  population_density: number;
  median_age: number;
  male_pct: number;
  female_pct: number;
  race_ethnicity: {
    white: number;
    black: number;
    hispanic: number;
    asian: number;
    native_american: number;
    pacific_islander: number;
    two_or_more: number;
    other: number;
  };
  foreign_born_pct: number;
  median_household_size: number;
  population_growth_rate: number;
  veterans_pct: number;
  disability_pct: number;
  is_imputed?: boolean;
}

export interface CityEconomy {
  fips_code: string;
  year: number;
  median_household_income: number;
  per_capita_income: number;
  mean_household_income: number;
  unemployment_rate: number;
  poverty_rate: number;
  labor_force_participation: number;
  gini_coefficient: number;
  job_growth_rate: number;
  top_industries: { name: string; pct: number }[];
  income_brackets: { range: string; pct: number }[];
  is_imputed?: boolean;
}

export interface CityHousing {
  fips_code: string;
  year: number;
  median_home_value: number;
  median_rent: number;
  homeownership_rate: number;
  vacancy_rate: number;
  housing_units: number;
  median_rooms: number;
  median_year_built: number;
  price_to_income_ratio: number;
  rent_to_income_ratio: number;
  housing_cost_burden_pct: number;
  yoy_appreciation: number;
  is_imputed?: boolean;
}

export interface CityClimate {
  fips_code: string;
  avg_high_jan: number;
  avg_low_jan: number;
  avg_high_apr: number;
  avg_low_apr: number;
  avg_high_jul: number;
  avg_low_jul: number;
  avg_high_oct: number;
  avg_low_oct: number;
  annual_precipitation: number;
  annual_snowfall: number;
  sunny_days: number;
  rainy_days: number;
  days_above_90: number;
  days_below_32: number;
  avg_humidity: number;
  uv_index: number;
  comfort_index: number;
}

export interface CitySafety {
  fips_code: string;
  year: number;
  violent_crime_rate: number;
  property_crime_rate: number;
  total_crime_rate: number;
  crime_breakdown: {
    murder: number;
    rape: number;
    robbery: number;
    aggravated_assault: number;
    burglary: number;
    larceny: number;
    motor_vehicle_theft: number;
    arson: number;
  };
  crime_trend: 'decreasing' | 'stable' | 'increasing';
  safety_score: number;
  is_imputed?: boolean;
}

export interface CityEducation {
  fips_code: string;
  year: number;
  high_school_grad_pct: number;
  bachelors_pct: number;
  graduate_pct: number;
  school_enrollment: number;
  student_teacher_ratio: number;
  school_expenditure_per_pupil: number;
  top_schools: { name: string; rating: number; type: string }[];
  universities: { name: string; enrollment: number; type: string }[];
  is_imputed?: boolean;
}

export interface CityLivability {
  fips_code: string;
  walkscore: number;
  transit_score: number;
  bike_score: number;
  broadband_pct: number;
  commute_time_avg: number;
  commute_mode: {
    drove_alone: number;
    carpooled: number;
    public_transit: number;
    walked: number;
    worked_from_home: number;
    other: number;
  };
  aqi_avg: number;
  parks_per_capita: number;
  hospitals_per_capita: number;
  grocery_stores_per_capita: number;
  is_imputed?: boolean;
}

export interface CityComputedScores {
  fips_code: string;
  economic_resilience: number;
  hidden_gem_score: number;
  cultural_density_index: number;
  overall_livability: number;
  affordability_index: number;
}

export interface CityProfile {
  city: City;
  demographics: CityDemographics;
  economy: CityEconomy;
  housing: CityHousing;
  climate: CityClimate;
  safety: CitySafety;
  education: CityEducation;
  livability: CityLivability;
  computed_scores?: CityComputedScores;
}

// National averages for comparison
export interface NationalAverages {
  median_household_income: number;
  median_home_value: number;
  median_rent: number;
  unemployment_rate: number;
  poverty_rate: number;
  violent_crime_rate: number;
  property_crime_rate: number;
  bachelors_pct: number;
  commute_time_avg: number;
  homeownership_rate: number;
  median_age: number;
  population_growth_rate: number;
}

// Search result
export interface CitySearchResult {
  fips_code: string;
  name: string;
  state: string;
  state_code: string;
  population: number;
  slug: string;
}

// Comparison data point
export interface ComparisonPoint {
  label: string;
  cityValue: number;
  nationalAvg: number;
  stateAvg?: number;
  format: 'currency' | 'percent' | 'number' | 'score';
  higherIsBetter: boolean;
}
