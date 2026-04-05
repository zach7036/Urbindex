const fs = require('fs');
const https = require('https');
const path = require('path');
const zlib = require('zlib');
const tar = require('tar');

const FILE_URL = 'https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/archive/us-climate-normals_1991-2020_v1.0.1_monthly_temperature_by-variable_c20230403.tar.gz';
const DOWNLOAD_PATH = path.join(__dirname, 'noaa_normals.tar.gz');
const EXTRACT_DIR = path.join(__dirname, 'data', 'noaa_normals');

async function downloadAndExtract() {
  if (!fs.existsSync(EXTRACT_DIR)) {
    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
  }

  console.log('Downloading NOAA Monthly Normals (26MB)...');
  
  const fileStream = fs.createWriteStream(DOWNLOAD_PATH);
  
  await new Promise((resolve, reject) => {
    https.get(FILE_URL, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download, status: ${res.statusCode}`));
        return;
      }
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    }).on('error', reject);
  });

  console.log('Download complete. Extracting tar.gz...');
  
  await tar.x({
    file: DOWNLOAD_PATH,
    cwd: EXTRACT_DIR
  });

  console.log('Extraction complete! Files structure in:', EXTRACT_DIR);
  
  const files = fs.readdirSync(EXTRACT_DIR);
  console.log(files.slice(0, 10)); // list some files
}

downloadAndExtract().catch(console.error);
