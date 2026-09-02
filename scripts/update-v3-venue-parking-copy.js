const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');

const invitationPath = process.argv[2] || 'docs/assets/invitation.enc';
const passphrase = process.env.INVITATION_PASSPHRASE;
if (!passphrase) throw new Error('INVITATION_PASSPHRASE is required');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected once, found ${count}`);
  return source.replace(before, after);
}

const encrypted = fs.readFileSync(invitationPath);
const iterations = encrypted.readUInt32BE(8);
const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), encrypted.subarray(12, 28), iterations, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(28, 40));
decipher.setAAD(Buffer.from('wedding-card-v1'));
decipher.setAuthTag(encrypted.subarray(40, 56));
let html = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(56)), decipher.final()])).toString('utf8');

html = replaceOnce(html, '<h5>The BMK 컨벤션 4층</h5>', '<h5>BMK웨딩홀 4층 아스틴홀</h5>', 'venue name');
html = replaceOnce(
  html,
  '<div class="direction-item"><h3>자가용</h3><p>네비게이션에 TheBMK 컨벤션 검색<br>주차 무료</p></div>',
  '<div class="direction-item"><h3>자동차</h3><p>네비게이션에 BMK웨딩홀 검색 (주차 무료)</p></div>',
  'car and parking directions',
);

const mapSection = html.match(/<section class="section" id="map">[\s\S]*?<\/section>/)?.[0] || '';
if (!mapSection.includes('BMK웨딩홀 4층 아스틴홀')) throw new Error('new venue name missing');
if (!mapSection.includes('<h3>자동차</h3><p>네비게이션에 BMK웨딩홀 검색 (주차 무료)</p>')) {
  throw new Error('new car directions missing');
}
if (mapSection.includes('The BMK 컨벤션 4층') || mapSection.includes('<h3>자가용</h3>')) {
  throw new Error('old venue or car copy remains');
}

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const outputKey = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), salt, iterations, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', outputKey, iv);
cipher.setAAD(Buffer.from('wedding-card-v1'));
const ciphertext = Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(html))), cipher.final()]);
const header = Buffer.alloc(12);
header.write('WEDLOCK1');
header.writeUInt32BE(iterations, 8);
fs.writeFileSync(invitationPath, Buffer.concat([header, salt, iv, cipher.getAuthTag(), ciphertext]));

console.log('Updated the v3 venue and car directions copy.');
