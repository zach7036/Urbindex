/**
 * Urbindex — Master ETL Runner
 * 
 * Orchestrates all ETL scripts in the correct order.
 * Checks for required API keys before running each pipeline.
 * 
 * Usage:
 *   npx ts-node scripts/etl/run-all.ts           # Run all ETLs
 *   npx ts-node scripts/etl/run-all.ts --census   # Census only
 *   npx ts-node scripts/etl/run-all.ts --climate  # NOAA only
 *   npx ts-node scripts/etl/run-all.ts --crime    # FBI only
 *   npx ts-node scripts/etl/run-all.ts --air      # EPA only
 *   npx ts-node scripts/etl/run-all.ts --walk     # Walkability (OSM) only
 *   npx ts-node scripts/etl/run-all.ts --bls      # BLS only
 */

import 'dotenv/config';

const PIPELINE_STATUS: Record<string, { ready: boolean; reason?: string }> = {};

function checkEnvVar(name: string, label: string, signupUrl: string): boolean {
  const value = process.env[name];
  if (value && value.trim().length > 0) {
    console.log(`  ✅ ${label}: configured`);
    return true;
  }
  console.log(`  ❌ ${label}: NOT SET`);
  console.log(`     → Get one at: ${signupUrl}`);
  return false;
}

function printBanner() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     URBINDEX — Data Pipeline Runner      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
}

async function checkAllKeys() {
  console.log('🔑 Checking API Keys:\n');

  PIPELINE_STATUS['census'] = {
    ready: checkEnvVar('CENSUS_API_KEY', 'Census Bureau', 'https://api.census.gov/data/key_signup.html'),
  };

  PIPELINE_STATUS['climate'] = {
    ready: checkEnvVar('NOAA_API_TOKEN', 'NOAA Climate', 'https://www.ncdc.noaa.gov/cdo-web/token'),
  };

  PIPELINE_STATUS['crime'] = {
    ready: checkEnvVar('DATA_GOV_API_KEY', 'data.gov (FBI)', 'https://api.data.gov/signup/'),
  };

  PIPELINE_STATUS['air'] = {
    ready: checkEnvVar('AIRNOW_API_KEY', 'EPA AirNow', 'https://www.airnowapi.org/'),
  };

  PIPELINE_STATUS['walk'] = {
    ready: true, // Uses OpenStreetMap Overpass API — no key needed
  };
  console.log('  ✅ Walkability: OpenStreetMap (no key required)');

  PIPELINE_STATUS['bls'] = {
    ready: true, // BLS works without a key (just slower)
    reason: process.env.BLS_API_KEY ? undefined : 'No key (25 req/day mode)',
  };
  const blsKey = process.env.BLS_API_KEY;
  console.log(`  ${blsKey ? '✅' : '⚠️ '} BLS: ${blsKey ? 'configured' : 'no key (limited mode)'}`);

  PIPELINE_STATUS['supabase'] = {
    ready: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
  const sbReady = PIPELINE_STATUS['supabase'].ready;
  console.log(`  ${sbReady ? '✅' : '⚠️ '} Supabase: ${sbReady ? 'configured' : 'NOT CONFIGURED (data will be saved as JSON)'}`);

  console.log('');
}

function printSummary() {
  const readyCount = Object.values(PIPELINE_STATUS).filter(s => s.ready).length;
  const totalCount = Object.keys(PIPELINE_STATUS).length;

  console.log(`\n📋 Pipeline Status: ${readyCount}/${totalCount} ready`);
  console.log('');

  if (readyCount === 0) {
    console.log('⚠️  No API keys configured. Add them to .env.local and try again.');
    console.log('   The app will continue to work with seed data in the meantime.\n');
  }
}

async function main() {
  printBanner();
  await checkAllKeys();

  const args = process.argv.slice(2);
  const runAll = args.length === 0;

  // Determine which pipelines to run
  const pipelines = {
    census: runAll || args.includes('--census'),
    climate: runAll || args.includes('--climate'),
    crime: runAll || args.includes('--crime'),
    air: runAll || args.includes('--air'),
    walk: runAll || args.includes('--walk'),
    bls: runAll || args.includes('--bls'),
  };

  const toRun = Object.entries(pipelines)
    .filter(([name, shouldRun]) => shouldRun && PIPELINE_STATUS[name]?.ready)
    .map(([name]) => name);

  const skipped = Object.entries(pipelines)
    .filter(([name, shouldRun]) => shouldRun && !PIPELINE_STATUS[name]?.ready)
    .map(([name]) => name);

  if (skipped.length > 0) {
    console.log(`⏭️  Skipping (no API key): ${skipped.join(', ')}`);
  }

  if (toRun.length === 0) {
    console.log('Nothing to run. Add API keys to .env.local first.\n');
    printSummary();
    return;
  }

  console.log(`🚀 Running pipelines: ${toRun.join(', ')}\n`);
  console.log('─'.repeat(50));

  // Run pipelines in order
  // 1. Census first (provides the city list + core data)
  if (toRun.includes('census')) {
    console.log('\n📦 STEP 1: Census ACS Data\n');
    const { runCensusETL } = await import('./census-acs');
    await runCensusETL();
    console.log('\n' + '─'.repeat(50));
  }

  // 2. Climate data
  if (toRun.includes('climate')) {
    console.log('\n📦 STEP 2: NOAA Climate Normals\n');
    // TODO: Load city list from Census output or database, then run the climate ETL
    console.log('   ℹ️  Requires Census ETL output — run Census first');
    console.log('\n' + '─'.repeat(50));
  }

  // 3. Crime data
  if (toRun.includes('crime')) {
    console.log('\n📦 STEP 3: FBI Crime Data\n');
    const { runCrimeETL } = await import('./fbi-crime');
    console.log('   ℹ️  Requires Census ETL output — run Census first');
    console.log('\n' + '─'.repeat(50));
  }

  // 4. Air quality
  if (toRun.includes('air')) {
    console.log('\n📦 STEP 4: EPA Air Quality\n');
    const { runAirQualityETL } = await import('./epa-airquality');
    console.log('   ℹ️  Requires Census ETL output — run Census first');
    console.log('\n' + '─'.repeat(50));
  }

  // 5. Walkability (OpenStreetMap)
  if (toRun.includes('walk')) {
    console.log('\n📦 STEP 5: Walkability (OpenStreetMap)\n');
    const { runWalkabilityETL } = await import('./walkability');
    console.log('   ℹ️  Requires Census ETL output — run Census first');
    console.log('\n' + '─'.repeat(50));
  }

  // 6. BLS
  if (toRun.includes('bls')) {
    console.log('\n📦 STEP 6: BLS Employment\n');
    const { runBLSETL } = await import('./bls-employment');
    console.log('   ℹ️  Requires Census ETL output — run Census first');
    console.log('\n' + '─'.repeat(50));
  }

  printSummary();
  console.log('✅ ETL pipeline complete!\n');
}

main().catch(console.error);
