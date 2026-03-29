-- ============================================================
-- Urbindex — Database Schema
-- PostgreSQL + PostGIS
-- ============================================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- Core city table
-- ============================================================
CREATE TABLE cities (
  fips_code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  state VARCHAR(100) NOT NULL,
  state_code CHAR(2) NOT NULL,
  county VARCHAR(255),
  county_fips VARCHAR(10),
  msa_code VARCHAR(10),
  latitude DECIMAL(10, 6) NOT NULL,
  longitude DECIMAL(10, 6) NOT NULL,
  geometry GEOMETRY(Point, 4326),
  population INTEGER NOT NULL DEFAULT 0,
  city_class VARCHAR(20) NOT NULL DEFAULT 'micro',
  slug VARCHAR(255) NOT NULL,
  timezone VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_cities_state_slug UNIQUE (state_code, slug)
);

CREATE INDEX idx_cities_state ON cities(state_code);
CREATE INDEX idx_cities_population ON cities(population DESC);
CREATE INDEX idx_cities_slug ON cities(slug);
CREATE INDEX idx_cities_geometry ON cities USING GIST(geometry);
CREATE INDEX idx_cities_class ON cities(city_class);

-- ============================================================
-- Demographics
-- ============================================================
CREATE TABLE city_demographics (
  id SERIAL PRIMARY KEY,
  fips_code VARCHAR(10) NOT NULL REFERENCES cities(fips_code) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_population INTEGER,
  population_density DECIMAL(10, 2),
  median_age DECIMAL(5, 2),
  male_pct DECIMAL(5, 2),
  female_pct DECIMAL(5, 2),
  race_ethnicity JSONB,
  foreign_born_pct DECIMAL(5, 2),
  median_household_size DECIMAL(4, 2),
  population_growth_rate DECIMAL(6, 3),
  veterans_pct DECIMAL(5, 2),
  disability_pct DECIMAL(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_demographics_year UNIQUE (fips_code, year)
);

-- ============================================================
-- Economy
-- ============================================================
CREATE TABLE city_economy (
  id SERIAL PRIMARY KEY,
  fips_code VARCHAR(10) NOT NULL REFERENCES cities(fips_code) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  median_household_income INTEGER,
  per_capita_income INTEGER,
  mean_household_income INTEGER,
  unemployment_rate DECIMAL(5, 2),
  poverty_rate DECIMAL(5, 2),
  labor_force_participation DECIMAL(5, 2),
  gini_coefficient DECIMAL(5, 4),
  job_growth_rate DECIMAL(6, 3),
  top_industries JSONB,
  income_brackets JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_economy_year UNIQUE (fips_code, year)
);

-- ============================================================
-- Housing
-- ============================================================
CREATE TABLE city_housing (
  id SERIAL PRIMARY KEY,
  fips_code VARCHAR(10) NOT NULL REFERENCES cities(fips_code) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  median_home_value INTEGER,
  median_rent INTEGER,
  homeownership_rate DECIMAL(5, 2),
  vacancy_rate DECIMAL(5, 2),
  housing_units INTEGER,
  median_rooms DECIMAL(4, 2),
  median_year_built INTEGER,
  price_to_income_ratio DECIMAL(6, 3),
  rent_to_income_ratio DECIMAL(6, 3),
  housing_cost_burden_pct DECIMAL(5, 2),
  yoy_appreciation DECIMAL(6, 3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_housing_year UNIQUE (fips_code, year)
);

-- ============================================================
-- Climate
-- ============================================================
CREATE TABLE city_climate (
  id SERIAL PRIMARY KEY,
  fips_code VARCHAR(10) NOT NULL REFERENCES cities(fips_code) ON DELETE CASCADE,
  avg_high_jan DECIMAL(5, 2),
  avg_low_jan DECIMAL(5, 2),
  avg_high_apr DECIMAL(5, 2),
  avg_low_apr DECIMAL(5, 2),
  avg_high_jul DECIMAL(5, 2),
  avg_low_jul DECIMAL(5, 2),
  avg_high_oct DECIMAL(5, 2),
  avg_low_oct DECIMAL(5, 2),
  annual_precipitation DECIMAL(6, 2),
  annual_snowfall DECIMAL(6, 2),
  sunny_days INTEGER,
  rainy_days INTEGER,
  days_above_90 INTEGER,
  days_below_32 INTEGER,
  avg_humidity DECIMAL(5, 2),
  uv_index DECIMAL(4, 2),
  comfort_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_climate UNIQUE (fips_code)
);

-- ============================================================
-- Safety
-- ============================================================
CREATE TABLE city_safety (
  id SERIAL PRIMARY KEY,
  fips_code VARCHAR(10) NOT NULL REFERENCES cities(fips_code) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  violent_crime_rate DECIMAL(10, 2),
  property_crime_rate DECIMAL(10, 2),
  total_crime_rate DECIMAL(10, 2),
  crime_breakdown JSONB,
  crime_trend VARCHAR(20),
  safety_score INTEGER,
  is_imputed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_safety_year UNIQUE (fips_code, year)
);

-- ============================================================
-- Education
-- ============================================================
CREATE TABLE city_education (
  id SERIAL PRIMARY KEY,
  fips_code VARCHAR(10) NOT NULL REFERENCES cities(fips_code) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  high_school_grad_pct DECIMAL(5, 2),
  bachelors_pct DECIMAL(5, 2),
  graduate_pct DECIMAL(5, 2),
  school_enrollment INTEGER,
  student_teacher_ratio DECIMAL(5, 2),
  school_expenditure_per_pupil INTEGER,
  top_schools JSONB,
  universities JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_education_year UNIQUE (fips_code, year)
);

-- ============================================================
-- Livability
-- ============================================================
CREATE TABLE city_livability (
  id SERIAL PRIMARY KEY,
  fips_code VARCHAR(10) NOT NULL REFERENCES cities(fips_code) ON DELETE CASCADE,
  walkscore INTEGER,
  transit_score INTEGER,
  bike_score INTEGER,
  broadband_pct DECIMAL(5, 2),
  commute_time_avg DECIMAL(5, 2),
  commute_mode JSONB,
  aqi_avg DECIMAL(5, 2),
  parks_per_capita DECIMAL(6, 2),
  hospitals_per_capita DECIMAL(6, 2),
  grocery_stores_per_capita DECIMAL(6, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_livability UNIQUE (fips_code)
);

-- ============================================================
-- Computed Scores (Phase 3)
-- ============================================================
CREATE TABLE city_computed_scores (
  id SERIAL PRIMARY KEY,
  fips_code VARCHAR(10) NOT NULL REFERENCES cities(fips_code) ON DELETE CASCADE,
  economic_resilience DECIMAL(5, 2),
  hidden_gem_score DECIMAL(5, 2),
  cultural_density_index DECIMAL(5, 2),
  overall_livability DECIMAL(5, 2),
  affordability_index DECIMAL(5, 2),
  remote_work_score DECIMAL(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_computed_scores UNIQUE (fips_code)
);

-- ============================================================
-- Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cities', 'city_demographics', 'city_economy', 'city_housing',
    'city_climate', 'city_safety', 'city_education', 'city_livability',
    'city_computed_scores'
  ]
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END;
$$;
