// Same initialisation as aivorah-learning-paths-service/services/firebaseAdmin.js.
let firebaseAdmin = null;
try {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    let credential = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
      credential = admin.credential.cert(JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')));
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    } else {
      const svcPath = require('path').join(__dirname, '../firebase-service-account.json');
      if (require('fs').existsSync(svcPath)) credential = admin.credential.cert(require(svcPath));
    }
    if (credential) {
      admin.initializeApp({ credential });
      firebaseAdmin = admin;
    } else {
      console.warn('[firebase-admin] no service account found — authenticated routes will return 503');
    }
  } else {
    firebaseAdmin = admin;
  }
} catch (e) {
  console.warn('[firebase-admin] not available:', e.message);
}

module.exports = firebaseAdmin;
