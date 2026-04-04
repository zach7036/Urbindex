// ============================================================
// Urbindex — Metric Registry for Analytics Rankings
// ============================================================

export type MetricFormat = 'number' | 'currency' | 'percent' | 'temperature' | 'score' | 'days' | 'inches' | 'minutes' | 'ratio' | 'rate' | 'year';

export interface MetricDef {
  key: string;            // Column name in the DB
  label: string;          // Human-readable label
  category: MetricCategory;
  table: string;          // Supabase table name
  format: MetricFormat;
  higherIsBetter: boolean;
  nationalAvg?: number;   // For the average marker
  description?: string;   // Tooltip / subtitle
}

export type MetricCategory =
  | 'demographics'
  | 'economy'
  | 'housing'
  | 'climate'
  | 'safety'
  | 'education'
  | 'livability'
  | 'scores';

export interface CategoryDef {
  key: MetricCategory;
  label: string;
  color: string;
  icon: string; // Lucide icon name
}

export const CATEGORIES: CategoryDef[] = [
  { key: 'demographics', label: 'Demographics', color: '#8b5cf6', icon: 'Users' },
  { key: 'economy',      label: 'Economy',      color: '#06d6a0', icon: 'DollarSign' },
  { key: 'housing',      label: 'Housing',       color: '#f59e0b', icon: 'Home' },
  { key: 'climate',      label: 'Climate',       color: '#3b82f6', icon: 'Sun' },
  { key: 'safety',       label: 'Safety',        color: '#ef4444', icon: 'Shield' },
  { key: 'education',    label: 'Education',     color: '#a855f7', icon: 'GraduationCap' },
  { key: 'livability',   label: 'Livability',    color: '#14b8a6', icon: 'TreePine' },
  { key: 'scores',       label: 'Scores',        color: '#f97316', icon: 'Star' },
];

export const METRICS: MetricDef[] = [
  // ─── Demographics ────────────────────────────────────
  { key: 'population', label: 'Population', category: 'demographics', table: 'cities', format: 'number', higherIsBetter: true, description: 'Total number of residents living in the city' },
  { key: 'total_population', label: 'Total Population (Census)', category: 'demographics', table: 'city_demographics', format: 'number', higherIsBetter: true, description: 'Official population count from the US Census Bureau' },
  { key: 'population_density', label: 'Population Density', category: 'demographics', table: 'city_demographics', format: 'number', higherIsBetter: true, description: 'People per square mile' },
  { key: 'median_age', label: 'Median Age', category: 'demographics', table: 'city_demographics', format: 'number', higherIsBetter: false, nationalAvg: 38.9, description: 'The age where half the population is older and half is younger' },
  { key: 'population_growth_rate', label: 'Population Growth Rate', category: 'demographics', table: 'city_demographics', format: 'percent', higherIsBetter: true, nationalAvg: 0.4, description: 'Year-over-year percentage change in population' },
  { key: 'foreign_born_pct', label: 'Foreign Born %', category: 'demographics', table: 'city_demographics', format: 'percent', higherIsBetter: true, description: 'Percentage of residents born outside the United States' },
  { key: 'disability_pct', label: 'Disability %', category: 'demographics', table: 'city_demographics', format: 'percent', higherIsBetter: false, description: 'Percentage of the population with a disability' },
  { key: 'median_household_size', label: 'Avg Household Size', category: 'demographics', table: 'city_demographics', format: 'number', higherIsBetter: true, description: 'Average number of people living in each household' },

  // ─── Economy ────────────────────────────────────────
  { key: 'median_household_income', label: 'Median Household Income', category: 'economy', table: 'city_economy', format: 'currency', higherIsBetter: true, nationalAvg: 75149, description: 'Typical annual income for a household in the city' },
  { key: 'per_capita_income', label: 'Per Capita Income', category: 'economy', table: 'city_economy', format: 'currency', higherIsBetter: true, description: 'Average income per person, including children and non-workers' },
  { key: 'mean_household_income', label: 'Mean Household Income', category: 'economy', table: 'city_economy', format: 'currency', higherIsBetter: true, description: 'Average income across all households (skewed by high earners)' },
  { key: 'unemployment_rate', label: 'Unemployment Rate', category: 'economy', table: 'city_economy', format: 'percent', higherIsBetter: false, nationalAvg: 3.6, description: 'Percentage of the labor force without a job and actively seeking work' },
  { key: 'poverty_rate', label: 'Poverty Rate', category: 'economy', table: 'city_economy', format: 'percent', higherIsBetter: false, nationalAvg: 12.4, description: 'Percentage of residents living below the federal poverty line' },
  { key: 'labor_force_participation', label: 'Labor Force Participation', category: 'economy', table: 'city_economy', format: 'percent', higherIsBetter: true, description: 'Percentage of working-age adults who are employed or seeking employment' },
  { key: 'gini_coefficient', label: 'Gini Coefficient (Inequality)', category: 'economy', table: 'city_economy', format: 'ratio', higherIsBetter: false, description: '0 = perfect equality, 1 = maximum inequality' },

  // ─── Housing ────────────────────────────────────────
  { key: 'median_home_value', label: 'Median Home Value', category: 'housing', table: 'city_housing', format: 'currency', higherIsBetter: false, nationalAvg: 281900, description: 'Midpoint value of owner-occupied homes in the city' },
  { key: 'median_rent', label: 'Median Rent', category: 'housing', table: 'city_housing', format: 'currency', higherIsBetter: false, nationalAvg: 1163, description: 'Midpoint monthly rent for occupied rental units' },
  { key: 'homeownership_rate', label: 'Homeownership Rate', category: 'housing', table: 'city_housing', format: 'percent', higherIsBetter: true, nationalAvg: 65.2, description: 'Percentage of occupied housing units owned by their residents' },
  { key: 'vacancy_rate', label: 'Vacancy Rate', category: 'housing', table: 'city_housing', format: 'percent', higherIsBetter: false, description: 'Percentage of housing units that are unoccupied' },
  { key: 'housing_units', label: 'Housing Units', category: 'housing', table: 'city_housing', format: 'number', higherIsBetter: true, description: 'Total number of houses, apartments, and condos in the city' },
  { key: 'median_rooms', label: 'Median Rooms', category: 'housing', table: 'city_housing', format: 'number', higherIsBetter: true, description: 'Typical number of rooms per housing unit' },
  { key: 'median_year_built', label: 'Median Year Built', category: 'housing', table: 'city_housing', format: 'year', higherIsBetter: true, description: 'Midpoint construction year of the housing stock' },
  { key: 'price_to_income_ratio', label: 'Price-to-Income Ratio', category: 'housing', table: 'city_housing', format: 'ratio', higherIsBetter: false, description: 'Home value divided by median income — lower means more affordable' },
  { key: 'rent_to_income_ratio', label: 'Rent-to-Income Ratio', category: 'housing', table: 'city_housing', format: 'percent', higherIsBetter: false, description: 'Percentage of income spent on rent — under 30% is considered affordable' },
  { key: 'housing_cost_burden_pct', label: 'Housing Cost Burden %', category: 'housing', table: 'city_housing', format: 'percent', higherIsBetter: false, description: 'Percentage of households spending over 30% of income on housing' },
  { key: 'yoy_appreciation', label: 'YoY Home Appreciation', category: 'housing', table: 'city_housing', format: 'percent', higherIsBetter: true, description: 'Year-over-year percentage change in home values' },

  // ─── Climate ────────────────────────────────────────
  { key: 'avg_high_jul', label: 'Avg Summer High (Jul)', category: 'climate', table: 'city_climate', format: 'temperature', higherIsBetter: false, description: 'Average daily high temperature in July' },
  { key: 'avg_low_jan', label: 'Avg Winter Low (Jan)', category: 'climate', table: 'city_climate', format: 'temperature', higherIsBetter: true, description: 'Average daily low temperature in January' },
  { key: 'avg_high_jan', label: 'Avg Winter High (Jan)', category: 'climate', table: 'city_climate', format: 'temperature', higherIsBetter: true, description: 'Average daily high temperature in January' },
  { key: 'avg_high_apr', label: 'Avg Spring High (Apr)', category: 'climate', table: 'city_climate', format: 'temperature', higherIsBetter: true, description: 'Average daily high temperature in April' },
  { key: 'avg_high_oct', label: 'Avg Fall High (Oct)', category: 'climate', table: 'city_climate', format: 'temperature', higherIsBetter: true, description: 'Average daily high temperature in October' },
  { key: 'annual_precipitation', label: 'Annual Precipitation', category: 'climate', table: 'city_climate', format: 'inches', higherIsBetter: false, description: 'Total inches of rain and melted snow per year' },
  { key: 'annual_snowfall', label: 'Annual Snowfall', category: 'climate', table: 'city_climate', format: 'inches', higherIsBetter: false, description: 'Total inches of snowfall per year' },
  { key: 'sunny_days', label: 'Sunny Days / Year', category: 'climate', table: 'city_climate', format: 'days', higherIsBetter: true, description: 'Number of days per year with mostly clear skies' },
  { key: 'rainy_days', label: 'Rainy Days / Year', category: 'climate', table: 'city_climate', format: 'days', higherIsBetter: false, description: 'Number of days per year with measurable precipitation' },
  { key: 'days_above_90', label: 'Days Above 90°F', category: 'climate', table: 'city_climate', format: 'days', higherIsBetter: false, description: 'Number of days per year where the temperature exceeds 90°F' },
  { key: 'days_below_32', label: 'Days Below 32°F', category: 'climate', table: 'city_climate', format: 'days', higherIsBetter: false, description: 'Number of days per year where the temperature drops below freezing' },
  { key: 'avg_humidity', label: 'Avg Humidity', category: 'climate', table: 'city_climate', format: 'percent', higherIsBetter: false, description: 'Average relative humidity throughout the year' },
  { key: 'uv_index', label: 'UV Index', category: 'climate', table: 'city_climate', format: 'number', higherIsBetter: false, description: 'Average ultraviolet radiation level — higher means more sun exposure' },
  { key: 'comfort_index', label: 'Comfort Index', category: 'climate', table: 'city_climate', format: 'score', higherIsBetter: true, description: 'Overall weather pleasantness score from 0–100' },

  // ─── Safety ────────────────────────────────────────
  { key: 'violent_crime_rate', label: 'Violent Crime Rate', category: 'safety', table: 'city_safety', format: 'rate', higherIsBetter: false, nationalAvg: 380.7, description: 'Violent crimes (murder, assault, robbery) per 100,000 residents' },
  { key: 'property_crime_rate', label: 'Property Crime Rate', category: 'safety', table: 'city_safety', format: 'rate', higherIsBetter: false, nationalAvg: 1954.4, description: 'Property crimes (burglary, theft, arson) per 100,000 residents' },
  { key: 'total_crime_rate', label: 'Total Crime Rate', category: 'safety', table: 'city_safety', format: 'rate', higherIsBetter: false, description: 'All reported crimes combined per 100,000 residents' },
  { key: 'safety_score', label: 'Safety Score', category: 'safety', table: 'city_safety', format: 'score', higherIsBetter: true, description: 'Composite safety rating from 0–100 based on all crime data' },

  // ─── Education ────────────────────────────────────────
  { key: 'high_school_grad_pct', label: 'High School Graduation %', category: 'education', table: 'city_education', format: 'percent', higherIsBetter: true, description: 'Percentage of adults 25+ with a high school diploma or equivalent' },
  { key: 'bachelors_pct', label: "Bachelor's Degree %", category: 'education', table: 'city_education', format: 'percent', higherIsBetter: true, nationalAvg: 33.7, description: "Percentage of adults 25+ with a bachelor's degree or higher" },
  { key: 'graduate_pct', label: 'Graduate Degree %', category: 'education', table: 'city_education', format: 'percent', higherIsBetter: true, description: "Percentage of adults 25+ with a master's, doctoral, or professional degree" },
  { key: 'student_teacher_ratio', label: 'Student-Teacher Ratio', category: 'education', table: 'city_education', format: 'ratio', higherIsBetter: false, description: 'Average number of students per teacher in local schools' },
  { key: 'school_expenditure_per_pupil', label: 'School Spending / Pupil', category: 'education', table: 'city_education', format: 'currency', higherIsBetter: true, description: 'Annual spending per student in the local school district' },

  // ─── Livability ────────────────────────────────────────
  { key: 'walkscore', label: 'Walk Score', category: 'livability', table: 'city_livability', format: 'score', higherIsBetter: true, description: 'How walkable the city is based on nearby amenities (0–100)' },
  { key: 'transit_score', label: 'Transit Score', category: 'livability', table: 'city_livability', format: 'score', higherIsBetter: true, description: 'Quality and access to public transportation (0–100)' },
  { key: 'bike_score', label: 'Bike Score', category: 'livability', table: 'city_livability', format: 'score', higherIsBetter: true, description: 'How bikeable the city is based on infrastructure and terrain (0–100)' },
  { key: 'broadband_pct', label: 'Broadband Access %', category: 'livability', table: 'city_livability', format: 'percent', higherIsBetter: true, description: 'Percentage of households with high-speed internet access' },
  { key: 'commute_time_avg', label: 'Avg Commute Time', category: 'livability', table: 'city_livability', format: 'minutes', higherIsBetter: false, nationalAvg: 27.6, description: 'Average one-way commute time for workers in minutes' },
  { key: 'aqi_avg', label: 'Air Quality Index (AQI)', category: 'livability', table: 'city_livability', format: 'number', higherIsBetter: false, description: 'Average air pollution level — lower is cleaner (0–500 scale)' },
  { key: 'parks_per_capita', label: 'Parks per 10K People', category: 'livability', table: 'city_livability', format: 'number', higherIsBetter: true, description: 'Number of parks and green spaces per 10,000 residents' },
  { key: 'hospitals_per_capita', label: 'Hospitals per 100K People', category: 'livability', table: 'city_livability', format: 'number', higherIsBetter: true, description: 'Number of hospitals and medical centers per 100,000 residents' },
  { key: 'grocery_stores_per_capita', label: 'Grocery Stores per 10K', category: 'livability', table: 'city_livability', format: 'number', higherIsBetter: true, description: 'Number of grocery stores and supermarkets per 10,000 residents' },

  // ─── Computed Scores ────────────────────────────────────────
  { key: 'overall_livability', label: 'Overall Livability', category: 'scores', table: 'city_computed_scores', format: 'score', higherIsBetter: true, description: 'Composite score combining economy, safety, education, and amenities (0–100)' },
  { key: 'affordability_index', label: 'Affordability Index', category: 'scores', table: 'city_computed_scores', format: 'score', higherIsBetter: true, description: 'How affordable the city is based on income, housing costs, and cost of living (0–100)' },
  { key: 'hidden_gem_score', label: 'Hidden Gem Score', category: 'scores', table: 'city_computed_scores', format: 'score', higherIsBetter: true, description: 'Underrated cities with high quality of life but low national attention (0–100)' },
  { key: 'cultural_density_index', label: 'City Pulse Score', category: 'scores', table: 'city_computed_scores', format: 'score', higherIsBetter: true, description: 'Cultural vibrancy based on restaurants, arts, nightlife, and diversity (0–100)' },
  { key: 'economic_resilience', label: 'Economic Resilience', category: 'scores', table: 'city_computed_scores', format: 'score', higherIsBetter: true, description: 'How well the economy can withstand downturns based on industry diversity (0–100)' },
  { key: 'remote_work_score', label: 'Remote Work Score', category: 'scores', table: 'city_computed_scores', format: 'score', higherIsBetter: true, description: 'Suitability for remote workers based on broadband, cost, and quality of life (0–100)' },
];

// Helper: get metrics for a category
export function getMetricsByCategory(cat: MetricCategory): MetricDef[] {
  return METRICS.filter(m => m.category === cat);
}

// Helper: format a metric value for display
export function formatMetricValue(value: number | null | undefined, format: MetricFormat): string {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'currency':
      return value >= 1_000_000
        ? `$${(value / 1_000_000).toFixed(1)}M`
        : value >= 1_000
        ? `$${Math.round(value).toLocaleString()}`
        : `$${value}`;
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'temperature':
      return `${Math.round(value)}°F`;
    case 'score':
      return `${Math.round(value)}`;
    case 'days':
      return `${Math.round(value)} days`;
    case 'inches':
      return `${value.toFixed(1)}"`;
    case 'minutes':
      return `${value.toFixed(1)} min`;
    case 'ratio':
      return value.toFixed(2);
    case 'rate':
      return value.toFixed(1);
    case 'year':
      return `${Math.round(value)}`;
    case 'number':
    default:
      return value >= 1_000_000
        ? `${(value / 1_000_000).toFixed(1)}M`
        : value >= 10_000
        ? `${(value / 1_000).toFixed(1)}K`
        : value % 1 === 0
        ? value.toLocaleString()
        : value.toFixed(1);
  }
}
