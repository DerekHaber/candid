// Run once on the server to download the nsfwjs model locally:
//   node setup-nsfw-model.js
const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(__dirname, 'nsfw-model');
const BASE_URL = 'https://raw.githubusercontent.com/infinitered/nsfwjs/master/example/nsfw_demo/public/quant_nsfw_mobilenet_v2';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

async function main() {
  if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR);

  console.log('Downloading model.json...');
  const modelJsonPath = path.join(MODEL_DIR, 'model.json');
  await download(`${BASE_URL}/model.json`, modelJsonPath);

  const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
  const shards = modelJson.weightsManifest.flatMap(m => m.paths);

  for (const shard of shards) {
    console.log(`Downloading ${shard}...`);
    await download(`${BASE_URL}/${shard}`, path.join(MODEL_DIR, shard));
  }

  console.log('Model downloaded to ./nsfw-model/');
}

main().catch(err => { console.error(err.message); process.exit(1); });
