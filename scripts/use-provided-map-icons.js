const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');

const path = process.argv[2] || 'docs/assets/invitation.enc';
const passphrase = process.env.INVITATION_PASSPHRASE;
if (!passphrase) throw new Error('INVITATION_PASSPHRASE is required');

const encrypted = fs.readFileSync(path);
const iterations = encrypted.readUInt32BE(8);
const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), encrypted.subarray(12, 28), iterations, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(28, 40));
decipher.setAAD(Buffer.from('wedding-card-v1'));
decipher.setAuthTag(encrypted.subarray(40, 56));
let html = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(56)), decipher.final()])).toString('utf8');

const icons = {
  naver: ['네이버지도', 'images/map-icons/naver-map.webp'],
  kakaonavi: ['카카오내비', 'images/map-icons/kakao-navi.svg'],
  kakaomap: ['카카오맵', 'images/map-icons/kakao-map.png'],
  tmap: ['티맵', 'images/map-icons/tmap.svg'],
  google: ['구글지도', 'images/map-icons/google-maps.webp'],
};

for (const [service, [label, source]] of Object.entries(icons)) {
  const pattern = new RegExp(`(<button[^>]*onclick="openMapApp\\('${service}'\\)"[^>]*>)[\\s\\S]*?(</button>)`);
  const matches = html.match(pattern);
  if (!matches) throw new Error(`Could not find ${service} button`);
  html = html.replace(pattern, `$1<img class="map-service-icon" src="${source}" alt="" loading="lazy">${label}$2`);
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
fs.writeFileSync(path, Buffer.concat([header, salt, iv, cipher.getAuthTag(), ciphertext]));
console.log('Replaced temporary SVGs with the provided map icons.');
