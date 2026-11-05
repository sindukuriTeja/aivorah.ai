/**
 * scripts/migrate_page_images_to_cloudinary.js
 *
 * Same broken-local-path problem as coverImageUrl (see
 * migrate_local_covers_to_cloudinary.js), but for each story PAGE's own
 * imageUrl - 211 of 235 pages across all stories pointed at local paths
 * this service never served. Uploads each unique real source image once
 * (dedup by source path, since a page's image can repeat) and rewrites
 * every matching imageUrl to the resulting Cloudinary URL.
 *
 * Requires env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const FormData = require('form-data');

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET env vars first.');
  process.exit(1);
}

const SOURCE_DIR = path.resolve(__dirname, '..', '..', 'ai-mentor', 'server', 'data', 'images', 'stories');
const STORIES_JSON = path.resolve(__dirname, '..', 'data', 'bhagavata_stories.json');

function signature(params) {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(sorted + API_SECRET).digest('hex');
}

function uploadToCloudinary(filePath, publicId) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = signature({ public_id: publicId, timestamp });

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('public_id', publicId);
    form.append('timestamp', String(timestamp));
    form.append('api_key', API_KEY);
    form.append('signature', sig);

    const req = https.request({
      method: 'POST',
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUD_NAME}/image/upload`,
      headers: form.getHeaders(),
    }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.secure_url) resolve(json.secure_url);
          else reject(new Error(JSON.stringify(json)));
        } catch (e) { reject(new Error('bad response: ' + body.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

async function main() {
  const stories = JSON.parse(fs.readFileSync(STORIES_JSON, 'utf8'));

  // Collect every unique local path referenced by any page's imageUrl.
  const uniquePaths = new Set();
  for (const s of stories) {
    for (const p of s.pages || []) {
      if (p.imageUrl && p.imageUrl.startsWith('/data/images')) uniquePaths.add(p.imageUrl);
    }
  }
  console.log(`${uniquePaths.size} unique local page images to migrate.`);

  const urlMap = new Map(); // localPath -> cloudinaryUrl
  const results = [];

  for (const localPath of uniquePaths) {
    const rel = localPath.replace(/^\/data\/images\/stories\//, '');
    const srcPath = path.join(SOURCE_DIR, rel);
    if (!fs.existsSync(srcPath)) {
      console.log(`[skip] source not found: ${srcPath}`);
      results.push({ localPath, status: 'source-missing' });
      continue;
    }
    const storyFolder = rel.split('/')[0];
    const fileBase = path.basename(rel, path.extname(rel));
    const publicId = `ai_mentor/stories/${storyFolder}/${fileBase}`;

    try {
      const url = await uploadToCloudinary(srcPath, publicId);
      urlMap.set(localPath, url);
      console.log(`[ok] ${localPath} -> ${url}`);
      results.push({ localPath, status: 'uploaded', url });
    } catch (err) {
      console.log(`[error] ${localPath}: ${err.message}`);
      results.push({ localPath, status: 'error', error: err.message });
    }
  }

  let rewritten = 0;
  for (const s of stories) {
    for (const p of s.pages || []) {
      if (p.imageUrl && urlMap.has(p.imageUrl)) {
        p.imageUrl = urlMap.get(p.imageUrl);
        rewritten++;
      }
    }
  }

  fs.writeFileSync(STORIES_JSON, JSON.stringify(stories, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, 'page_migration_summary.json'), JSON.stringify(results, null, 2));

  const uploaded = results.filter((r) => r.status === 'uploaded').length;
  console.log(`\nDONE. Unique files uploaded: ${uploaded}/${results.length}. Page references rewritten: ${rewritten}.`);
}

main().catch((err) => { console.error('Crashed:', err); process.exit(1); });
