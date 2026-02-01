import crypto from 'crypto';

if (process.argv.length < 3) {
  console.log('Usage: node generate-hash.js <password>');
  process.exit(1);
}

const password = process.argv[2];
const hash = crypto.createHash('sha256').update(password).digest('hex');

console.log(`Password: ${password}`);
console.log(`SHA-256 Hash: ${hash}`);
console.log('');
console.log('Replace ADMIN_PASSWORD_HASH in server.js with this hash:');
console.log(`const ADMIN_PASSWORD_HASH = '${hash}';`);