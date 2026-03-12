// Run once: node migrate-storage.js
// Migrates all files from Supabase Storage (photos bucket) → Cloudflare R2
// Requires: npm install @supabase/supabase-js @aws-sdk/client-s3 node-fetch dotenv
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const SUPABASE_URL = process.env.SUPABASE_URL;           // your Supabase project URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key (not anon)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function migrate() {
  console.log('Listing files in Supabase photos bucket...');

  // List all files (paginated — adjust if you have >1000 files)
  const { data: files, error } = await supabase.storage.from('photos').list('', {
    limit: 1000,
    offset: 0,
  });

  if (error) { console.error('List error:', error); process.exit(1); }

  // Supabase returns top-level "folders" (user ID prefixes) — recurse into each
  const allPaths = [];
  for (const item of files ?? []) {
    if (!item.id) {
      // It's a folder — list its contents
      const { data: inner } = await supabase.storage.from('photos').list(item.name, { limit: 1000 });
      for (const file of inner ?? []) {
        allPaths.push(`${item.name}/${file.name}`);
      }
    } else {
      allPaths.push(item.name);
    }
  }

  console.log(`Found ${allPaths.length} files. Starting migration...`);

  let done = 0;
  for (const path of allPaths) {
    try {
      // Download from Supabase (signed URL)
      const { data: signed } = await supabase.storage.from('photos').createSignedUrl(path, 60);
      if (!signed?.signedUrl) { console.warn(`Skip (no URL): ${path}`); continue; }

      const res = await fetch(signed.signedUrl);
      if (!res.ok) { console.warn(`Skip (fetch ${res.status}): ${path}`); continue; }

      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

      // Upload to R2
      await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: path,
        Body: buffer,
        ContentType: contentType,
      }));

      done++;
      if (done % 10 === 0) console.log(`  ${done}/${allPaths.length}`);
    } catch (e) {
      console.error(`Error migrating ${path}:`, e.message);
    }
  }

  console.log(`Done. Migrated ${done}/${allPaths.length} files.`);
}

migrate();
