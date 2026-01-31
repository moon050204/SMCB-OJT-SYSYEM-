// Run: npm install firebase-admin
// usage: node set-admin-claim.js <UID> [isAdmin] [role]
// example: node set-admin-claim.js abc123 true admin

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const svcPath = path.join(__dirname, 'serviceAccountKey.json'); // put your service account JSON here
if (!fs.existsSync(svcPath)) {
  console.error('serviceAccountKey.json not found. Download from Firebase Console and save at:', svcPath);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(svcPath))
});

const uid = process.argv[2];
const isAdmin = process.argv[3] === 'true';
const role = process.argv[4] || (isAdmin ? 'admin' : 'user');

if (!uid) {
  console.error('Usage: node set-admin-claim.js <UID> [isAdmin] [role]');
  process.exit(1);
}

const claims = { admin: !!isAdmin, role };

admin.auth().setCustomUserClaims(uid, claims)
  .then(() => {
    console.log(`Custom claims set for ${uid}:`, claims);
    console.log('Ask the user to sign out and sign in (or refresh token) to receive new claims.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error setting custom claims:', err);
    process.exit(1);
  });
