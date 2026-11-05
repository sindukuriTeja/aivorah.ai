/**
 * scripts/migrate_local_covers_to_cloudinary.js
 *
 * Some story covers referenced local paths (/data/images/stories/...) that
 * were never actually served by this service (no static route, and the
 * files themselves only ever existed in the old ai-mentor monolith
 * checkout, never copied here) — showing as permanently broken thumbnails.
 * Every other story already uses a real Cloudinary URL (same account,
 * folder convention ai_mentor/stories/<id>/<file>) which is the correct,
 * CDN-backed approach. This uploads the real, existing source images for
 * the broken ones to the same Cloudinary account/folder convention and
 * rewrites their coverImageUrl to match.
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
    const params = { public_id: publicId, timestamp };
    const sig = signature(params);

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
  const results = [];

  for (const s of stories) {
    if (!s.coverImageUrl || !s.coverImageUrl.startsWith('/data/images')) continue;

    const rel = s.coverImageUrl.replace(/^\/data\/images\/stories\//, '');
    const srcPath = path.join(SOURCE_DIR, rel);
    if (!fs.existsSync(srcPath)) {
      console.log(`[skip] ${s.title}: source file not found at ${srcPath}`);
      results.push({ title: s.title, status: 'source-missing' });
      continue;
    }

    const storyFolder = rel.split('/')[0];
    const fileBase = path.basename(rel, path.extname(rel));
    const publicId = `ai_mentor/stories/${storyFolder}/${fileBase}`;

    try {
      const url = await uploadToCloudinary(srcPath, publicId);
      s.coverImageUrl = url;
      console.log(`[ok] ${s.title} -> ${url}`);
      results.push({ title: s.title, status: 'uploaded', url });
    } catch (err) {
      console.log(`[error] ${s.title}: ${err.message}`);
      results.push({ title: s.title, status: 'error', error: err.message });
    }
  }

  fs.writeFileSync(STORIES_JSON, JSON.stringify(stories, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, 'cover_migration_summary.json'), JSON.stringify(results, null, 2));

  const uploaded = results.filter((r) => r.status === 'uploaded').length;
  console.log(`\nDONE. Uploaded: ${uploaded}/${results.length}`);
}

main().catch((err) => { console.error('Crashed:', err); process.exit(1); });
