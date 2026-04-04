/**
 * Urbindex — Fix University Enrollment with Exact IPEDS Data
 * 
 * Downloads EFFY2022 (12-month enrollment) from NCES IPEDS
 * and updates enrollment numbers with exact figures.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function getSchoolType(control, level) {
  const ownerLabel = control === 1 ? 'Public' : control === 2 ? 'Private' : 'For-Profit';
  const levelLabel = level === 1 ? 'University' : level === 2 ? 'Community College' : 'Technical School';
  return `${ownerLabel} ${levelLabel}`;
}

async function downloadAndExtract(url, prefix) {
  const zipPath = path.resolve(__dirname, prefix + '.zip');
  
  console.log(`  Downloading ${prefix}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(zipPath, Buffer.from(buffer));
  
  console.log(`  Extracting...`);
  const extractDir = path.resolve(__dirname, prefix + '_extracted');
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'pipe' });
  
  // Find the CSV
  const files = fs.readdirSync(extractDir);
  const csvFile = files.find(f => f.toLowerCase().endsWith('.csv'));
  if (!csvFile) throw new Error('No CSV found in ' + prefix);
  
  const csvPath = path.resolve(extractDir, csvFile);
  console.log(`  Found: ${csvFile}`);
  
  // Cleanup zip
  try { fs.unlinkSync(zipPath); } catch {}
  
  return csvPath;
}

async function run() {
  console.log('\n=== Fix University Enrollment (Exact IPEDS Data) ===\n');

  // Step 1: Load all cities
  console.log('Loading cities...');
  let allCities = [];
  let from = 0;
  while (true) {
    const { data: batch } = await supabase.from('cities').select('fips_code, name, state_code').range(from, from + 999);
    if (!batch || batch.length === 0) break;
    allCities = allCities.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  console.log(`  ${allCities.length} cities loaded`);
  
  const cityLookup = {};
  for (const c of allCities) {
    cityLookup[`${c.name.toLowerCase()}|${c.state_code.toUpperCase()}`] = c.fips_code;
  }

  // Step 2: Download both IPEDS files
  console.log('\nDownloading IPEDS files...');
  const hdPath = await downloadAndExtract('https://nces.ed.gov/ipeds/datacenter/data/HD2022.zip', 'hd2022');
  const effyPath = await downloadAndExtract('https://nces.ed.gov/ipeds/datacenter/data/EFFY2022.zip', 'effy2022');

  // Step 3: Parse enrollment data (EFFY2022)
  // EFFY has: UNITID, EFFYLEV (level), EFYTOTLT (total enrollment)
  // EFFYLEV=1 means all students total
  console.log('\nParsing enrollment data...');
  const effyContent = fs.readFileSync(effyPath, 'utf-8');
  const effyLines = effyContent.split('\n');
  const effyHeaders = parseCSVLine(effyLines[0]);
  
  const eUnitIdx = effyHeaders.findIndex(h => h.toUpperCase() === 'UNITID');
  const eLevelIdx = effyHeaders.findIndex(h => h.toUpperCase() === 'EFFYLEV');
  const eTotalIdx = effyHeaders.findIndex(h => h.toUpperCase() === 'EFYTOTLT');
  
  console.log(`  EFFY columns: UNITID=${eUnitIdx}, EFFYLEV=${eLevelIdx}, EFYTOTLT=${eTotalIdx}`);
  
  // Build enrollment lookup: UNITID -> total enrollment
  const enrollmentByUnitId = {};
  for (let i = 1; i < effyLines.length; i++) {
    if (!effyLines[i].trim()) continue;
    const row = parseCSVLine(effyLines[i]);
    const unitId = row[eUnitIdx];
    const level = parseInt(row[eLevelIdx]);
    const total = parseInt(row[eTotalIdx]);
    
    // EFFYLEV=1 or 2 = all students (we want the grand total)
    if (level === 1 && !isNaN(total) && total > 0) {
      enrollmentByUnitId[unitId] = total;
    }
  }
  console.log(`  ${Object.keys(enrollmentByUnitId).length} schools with enrollment data`);

  // Step 4: Parse institution directory (HD2022) and match to cities
  console.log('\nParsing institution data...');
  const hdContent = fs.readFileSync(hdPath, 'utf-8');
  const hdLines = hdContent.split('\n');
  const hdHeaders = parseCSVLine(hdLines[0]);
  
  const hUnitIdx = hdHeaders.findIndex(h => h.toUpperCase() === 'UNITID');
  const hNameIdx = hdHeaders.findIndex(h => h.toUpperCase() === 'INSTNM');
  const hCityIdx = hdHeaders.findIndex(h => h.toUpperCase() === 'CITY');
  const hStateIdx = hdHeaders.findIndex(h => h.toUpperCase() === 'STABBR');
  const hControlIdx = hdHeaders.findIndex(h => h.toUpperCase() === 'CONTROL');
  const hLevelIdx = hdHeaders.findIndex(h => h.toUpperCase() === 'ICLEVEL');
  
  const schoolsByCity = {};
  let matched = 0;

  for (let i = 1; i < hdLines.length; i++) {
    if (!hdLines[i].trim()) continue;
    const row = parseCSVLine(hdLines[i]);
    
    const unitId = row[hUnitIdx];
    const name = row[hNameIdx];
    const city = row[hCityIdx];
    const state = row[hStateIdx];
    const control = parseInt(row[hControlIdx]);
    const level = parseInt(row[hLevelIdx]);
    
    // Skip for-profit, less-than-2-year, missing data
    if (control === 3 || level === 3 || level === -3) continue;
    if (!name || !city || !state) continue;
    
    // Get exact enrollment
    const enrollment = enrollmentByUnitId[unitId] || 0;
    if (enrollment < 50) continue; // Skip very small schools

    // Match to our city
    const key = `${city.toLowerCase()}|${state.toUpperCase()}`;
    const fips = cityLookup[key];
    if (!fips) continue;

    if (!schoolsByCity[fips]) schoolsByCity[fips] = [];
    schoolsByCity[fips].push({
      name,
      type: getSchoolType(control, level),
      enrollment,
    });
    matched++;
  }

  console.log(`  Matched ${matched} schools to ${Object.keys(schoolsByCity).length} cities`);

  // Sort by enrollment, keep top 10
  const updates = [];
  for (const [fips, schools] of Object.entries(schoolsByCity)) {
    const sorted = schools.sort((a, b) => b.enrollment - a.enrollment).slice(0, 10);
    updates.push({ fips_code: fips, universities: sorted });
  }

  // Step 5: Update Supabase
  console.log(`\nUpdating ${updates.length} cities...`);
  let updated = 0, errors = 0;
  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(u =>
      supabase.from('city_education').update({ universities: u.universities }).eq('fips_code', u.fips_code)
    ));
    for (const r of results) { if (r.error) errors++; else updated++; }
    if (i % 500 === 0) console.log(`  ${i + batch.length}/${updates.length}...`);
  }

  console.log(`\n✅ Done! Updated ${updated} cities. Errors: ${errors}.\n`);

  // Cleanup
  try { fs.rmSync(path.resolve(__dirname, 'hd2022_extracted'), { recursive: true }); } catch {}
  try { fs.rmSync(path.resolve(__dirname, 'effy2022_extracted'), { recursive: true }); } catch {}

  // Verify with known schools
  console.log('Verification (checking exact enrollment):');
  for (const [name, fips] of [['Raleigh', '3755000'], ['Austin', '4805000'], ['New York', '3651000']]) {
    const { data } = await supabase.from('city_education').select('universities').eq('fips_code', fips).single();
    const unis = data?.universities || [];
    console.log(`\n  ${name}:`);
    unis.slice(0, 5).forEach(u => console.log(`    ${u.name}: ${u.enrollment.toLocaleString()} students`));
  }
}

run().catch(console.error);
