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

const mapSection = html.match(/<section class="section" id="map">[\s\S]*?<\/section>/)?.[0];
if (!mapSection) throw new Error('map section not found');
const mapLinks = mapSection.match(/<div class="map-links"[\s\S]*?<\/div>/)?.[0];
const mapFrame = mapSection.match(/<div class="map-frame">[\s\S]*?<\/div>/)?.[0];
if (!mapLinks || !mapFrame) throw new Error('map frame or navigation links not found');

const newMapSection = `<section class="section" id="map"><h2 class="section-title">오시는 길</h2>${mapFrame}${mapLinks}<div class="map-address"><h5>The BMK 컨벤션 4층</h5><h5>대전광역시 중구 서문로 133</h5></div><div class="directions"><div class="direction-item"><h3>자가용 주차</h3><p>무료 및 시간 제한 없음</p></div><div class="direction-item"><h3>지하철</h3><p>서대전네거리역 2번 출구에서 도보 약 10분</p></div><div class="direction-item"><h3>기차</h3><p>서대전역 1번 출구에서 도보 약 5분</p></div><div class="direction-item"><h3>버스</h3><p>서대전네거리 정류장 하차 후 도보 약 10분</p></div></div></section>`;
html = replaceOnce(html, mapSection, newMapSection, 'reorder map and replace directions');

const mapCss = `

  /* ---------- map layout and directions feedback ---------- */
  #map .map-frame{ margin-bottom:var(--gap-lg); }
  #map .map-links{ margin-bottom:var(--gap-lg); }
  #map .map-address{ margin-bottom:var(--gap-lg); }
  #map .map-address h5{ margin:0; }
  #map .map-address h5 + h5{
    margin-top:5px;
    color:var(--text-muted);
    font-size:.85rem;
    font-weight:500;
  }
  #map .directions{ margin-top:0; }
`;
html = replaceOnce(html, '</style></head>', `${mapCss}</style></head>`, 'style closing tag');

const updatedMap = html.match(/<section class="section" id="map">[\s\S]*?<\/section>/)?.[0] || '';
const expectedText = [
  '자가용 주차', '무료 및 시간 제한 없음',
  '서대전네거리역 2번 출구에서 도보 약 10분',
  '서대전역 1번 출구에서 도보 약 5분',
  '서대전네거리 정류장 하차 후 도보 약 10분',
];
for (const text of expectedText) {
  if (!updatedMap.includes(text)) throw new Error(`missing map text: ${text}`);
}
if ((updatedMap.match(/onclick="openMapApp\('/g) || []).length !== 5) throw new Error('map section does not contain exactly 5 app buttons');
if (!(updatedMap.indexOf('map-frame') < updatedMap.indexOf('map-links') && updatedMap.indexOf('map-links') < updatedMap.indexOf('map-address'))) {
  throw new Error('map content order is incorrect');
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

console.log('Reordered the map section and updated parking and transit directions.');
