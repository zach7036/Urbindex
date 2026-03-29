import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

const STATE_MAPPING: Record<string, string> = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
  'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
  'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
  'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS',
  'MISSOURI': 'MO', 'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND', 'OHIO': 'OH', 'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA',
  'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN',
  'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT', 'VIRGINIA': 'VA', 'WASHINGTON': 'WA',
  'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY', 'DISTRICT OF COLUMBIA': 'DC'
};

// Normalize city names to match DB (e.g. remove " Police Dept", extra spaces)
function cleanCityName(raw: string) {
  return raw.replace(/police department/i, '')
            .replace(/police dept/i, '')
            .replace(/[0-9,\.]/g, '') // remove footnote numbers
            .trim()
            .toLowerCase();
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  return parseInt(raw.replace(/,/g, ''), 10) || 0;
}

async function runCrimeCSV_ETL() {
  console.log('🔫 Urbindex FBI Crime Data ETL (CSV Fallback Mode)');
  console.log('==================================================');

  const csvPath = path.join(__dirname, 'data', 'fbi_crime_2022.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error('❌ Missing CSV File!');
    console.error(`Please place the FBI UCR Table 8 CSV file in: ${csvPath}`);
    console.error('You can download it from the FBI Crime Data Explorer (CDE).');
    return;
  }

  console.log('🔍 Fetching target cities from Supabase...');
  
  let allCities: any[] = [];
  let hasMore = true;
  let page = 0;
  while(hasMore) {
    const { data: chunk } = await supabase
      .from('cities')
      .select('fips_code, name, state_code')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (chunk && chunk.length > 0) {
      allCities.push(...chunk);
      page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`📊 Found ${allCities.length} total cities to map.`);

  // Strip FBI title garbage and inject a clean header
  const rawCsv = fs.readFileSync(csvPath, 'utf8');
  const lines = rawCsv.split('\n');
  
  // Find where the first real data row starts. ALABAMA starts at index 12 in the array
  // We can just find the first line that starts with ALABAMA
  const dataStartIndex = lines.findIndex(l => l.toUpperCase().includes('ALABAMA,'));
  const dataLines = dataStartIndex > 0 ? lines.slice(dataStartIndex) : lines.slice(12);

  const cleanHeader = "State,City,Population,ViolentCrime,Murder,Rape,Robbery,Assault,PropertyCrime,Burglary,Larceny,MotorTheft,Arson\n";
  const finalCsv = cleanHeader + dataLines.join('\n');
  
  // Parse CSV
  const parser = parse(finalCsv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true
  });

  const crimeDataRows: any[] = [];
  for await (const row of parser) {
    crimeDataRows.push(row);
  }

  let processedCount = 0;
  let matchedCount = 0;
  const toUpsert = [];

  // Iterate through rows and backfill empty states due to FBI excel formatting (merge cells)
  let currentState = '';
  for (const row of crimeDataRows) {
    if (row.State && row.State.trim() !== '') {
      currentState = row.State.trim().toUpperCase();
    }
    row.State = currentState;
  }

  for (const city of allCities) {
    const targetName = cleanCityName(city.name);
    // Try to find matching city in the CSV
    const match = crimeDataRows.find(row => {
      let rowState = row.State || '';
      const mappedStateCode = STATE_MAPPING[rowState] || rowState;

      const rowCity = row.City || '';
      const s2 = rowCity.trim().toLowerCase();
      
      return (mappedStateCode === city.state_code.toUpperCase()) && cleanCityName(s2).startsWith(targetName);
    });

    if (match) {
      matchedCount++;
      const pop = parseNumber(match.Population);
      const violent = parseNumber(match.ViolentCrime);
      const property = parseNumber(match.PropertyCrime);

      const per100k = (val: number) => pop > 0 ? Math.round((val / pop) * 100000 * 100) / 100 : 0;
      
      const violentRate = per100k(violent);
      const propertyRate = per100k(property);

      // Score 0-100 (National avg violent: ~380, property: ~1900)
      const violentScore = Math.max(0, 100 - (violentRate / 380) * 50);
      const propertyScore = Math.max(0, 100 - (propertyRate / 1900) * 50);
      const safetyScore = Math.round((violentScore * 0.7) + (propertyScore * 0.3));

      // Crime Breakdown
      const murder = parseNumber(match.Murder);
      const rape = parseNumber(match.Rape);
      const robbery = parseNumber(match.Robbery);
      const assault = parseNumber(match.Assault);
      const burglary = parseNumber(match.Burglary);
      const larceny = parseNumber(match.Larceny);
      const motor_theft = parseNumber(match.MotorTheft);
      const arson = parseNumber(match.Arson);

      toUpsert.push({
        fips_code: city.fips_code,
        year: 2022,
        violent_crime_rate: violentRate,
        property_crime_rate: propertyRate,
        total_crime_rate: violentRate + propertyRate,
        safety_score: Math.min(100, Math.max(0, safetyScore)),
        crime_trend: 'stable',
        crime_breakdown: {
          murder: per100k(murder),
          rape: per100k(rape),
          robbery: per100k(robbery),
          aggravated_assault: per100k(assault),
          burglary: per100k(burglary),
          larceny: per100k(larceny),
          motor_vehicle_theft: per100k(motor_theft),
          arson: per100k(arson),
        }
      });
    }

    processedCount++;
    if (processedCount % 500 === 0) {
      console.log(`   Mapped ${processedCount}/${allCities.length}...`);
    }
  }

  console.log(`\n✅ Matched ${matchedCount} out of ${allCities.length} cities to FBI records.`);
  
  if (toUpsert.length > 0) {
    console.log(`💾 Committing to Supabase...`);
    const BATCH_SIZE = 100;
    
    // First clear existing data for these cities so we can insert without constraint errors
    console.log('🧹 Purging outdated records for these cities...');
    const fipsList = toUpsert.map(u => u.fips_code);
    
    // Delete in chunks
    for (let i = 0; i < fipsList.length; i += 200) {
      const chunk = fipsList.slice(i, i + 200);
      await supabase.from('city_safety').delete().in('fips_code', chunk);
    }
    
    // Insert new data
    for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
      const batch = toUpsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('city_safety').insert(batch);
      if (error) {
        console.error('❌ Insert Error:', error.message);
      }
    }
    console.log(`🎉 Successfully inserted ${toUpsert.length} records into city_safety!`);
  }
}

runCrimeCSV_ETL().catch(console.error);
