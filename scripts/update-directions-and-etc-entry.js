const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');

const invitationPath = process.argv[2] || 'docs/assets/invitation.enc';
const shellPath = process.argv[3] || 'docs/index.html';
const aad = Buffer.from('wedding-card-v1', 'utf8');

function readAutoUnlockPassphrase() {
  const shell = fs.readFileSync(shellPath, 'utf8');
  const match = shell.match(/const j=\[([^\]]+)\],w=\[([^\]]+)\]/);
  if (!match) throw new Error('Auto-unlock key was not found in docs/index.html.');
  const concealed = match[1].split(',').map(Number);
  const mask = match[2].split(',').map(Number);
  if (concealed.length !== mask.length) throw new Error('Auto-unlock key parts are malformed.');
  return String.fromCharCode(...concealed.map((value, index) => value ^ mask[index]));
}

function decrypt(buffer, passphrase) {
  if (buffer.subarray(0, 8).toString() !== 'WEDLOCK1') throw new Error('Unsupported format.');
  const iterations = buffer.readUInt32BE(8);
  const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), buffer.subarray(12, 28), iterations, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(28, 40));
  decipher.setAAD(aad);
  decipher.setAuthTag(buffer.subarray(40, 56));
  const html = zlib.gunzipSync(Buffer.concat([decipher.update(buffer.subarray(56)), decipher.final()])).toString('utf8');
  return { html, iterations };
}

function encrypt(html, passphrase, iterations) {
  const compressed = zlib.gzipSync(Buffer.from(html, 'utf8'), { level: 9 });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), salt, iterations, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const header = Buffer.alloc(12);
  header.write('WEDLOCK1', 0, 'ascii');
  header.writeUInt32BE(iterations, 8);
  return Buffer.concat([header, salt, iv, cipher.getAuthTag(), ciphertext]);
}

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Expected exactly one patch target.');
  return source.replace(before, after);
}

const passphrase = readAutoUnlockPassphrase();
const { html, iterations } = decrypt(fs.readFileSync(invitationPath), passphrase);
const mapStart = html.indexOf('<section class="section" id="map">');
const mapEnd = html.indexOf('</section>', mapStart) + '</section>'.length;
if (mapStart < 0 || mapEnd < mapStart) throw new Error('Map section not found.');
const originalMap = html.slice(mapStart, mapEnd);
const links = originalMap.match(/<div class="map-links"[^>]*>[\s\S]*?<\/div>/)?.[0];
if (!links || (links.match(/onclick="openMapApp\('/g) || []).length !== 5) throw new Error('Expected five navigation buttons.');
const oldCar = '<div class="direction-item"><h3>자동차</h3><p>네비게이션에 BMK웨딩홀 검색 (주차 무료)</p></div>';
const shuttle = '<div class="direction-item"><h3>셔틀버스</h3><p>노원역 8번 출구에서 예식일 오전 10시 30분 출발</p></div>';
const car = `<div class="direction-item"><h3>자동차</h3><p>사용하는 네비게이션에 BMK웨딩홀 검색</p><p>주차 무료</p>${links}</div>`;
let map = replaceOnce(originalMap, links, '');
// Replace the original last item first, so the swap cannot match the new shuttle.
map = replaceOnce(map, shuttle, car);
map = replaceOnce(map, oldCar, shuttle);
map = replaceOnce(map,
  '<h3>기차</h3><p>서대전역 1번 출구에서 도보 약 5분</p>',
  '<h3>기차</h3><p>서대전역 하차시 1번 출구에서 도보 약 5분</p><p>대전역 하차시 대전역에서 지하철 탑승해 서대전네거리역 하차</p>');
let next = replaceOnce(html, originalMap, map);
const commentStart = next.indexOf('<section class="section" id="comment">');
const commentEnd = next.indexOf('</section>', commentStart) + '</section>'.length;
if (commentStart < 0 || commentEnd < commentStart || next.includes('id="bottom-etc"')) throw new Error('Expected comments without an ETC entry.');
const entry = `<div class="local-guide-entry"><a id="bottom-etc" href="etc.html" target="_top"><span>잠시 더 머무는 대전</span><span aria-hidden="true">↗</span></a></div>`;
next = next.slice(0, commentEnd) + entry + next.slice(commentEnd);
next = replaceOnce(next,
  "document.getElementById('nav-etc').href = new URL('etc.html', window.parent.location.href).href;",
  "document.querySelectorAll('#nav-etc, #bottom-etc').forEach(link => {\n    link.href = new URL('etc.html', window.parent.location.href).href;\n  });");
next = replaceOnce(next, '</style>', `
  #map .direction-item .map-links{ margin:16px 0 0; }
  #map .direction-item p + p{ margin-top:8px; }
  .local-guide-entry{ max-width:480px; margin:0 auto; padding:0 32px 64px; }
  .local-guide-entry a{
    display:flex; align-items:center; justify-content:space-between; gap:16px;
    min-height:56px; padding:16px 20px; border:1px solid var(--accent);
    border-radius:var(--radius); background:var(--bg-soft); color:var(--accent);
    font:inherit; font-size:.86rem; text-decoration:none;
  }
  .local-guide-entry a:hover{ background:var(--accent-surface); }
  .local-guide-entry a:focus-visible{ outline:2px solid var(--accent); outline-offset:4px; }
</style>`);
const headings = [...map.matchAll(/<h3>(.*?)<\/h3>/g)].map(match => match[1]);
if (headings.join(',') !== '셔틀버스,지하철,기차,버스,자동차') throw new Error('Incorrect direction order.');
if ((next.match(/onclick="openMapApp\('/g) || []).length !== 5) throw new Error('Navigation buttons were duplicated or lost.');
if (!next.includes(car)) throw new Error('Navigation buttons must be inside the car item.');
const output = encrypt(next, passphrase, iterations);
if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed.');
fs.writeFileSync(invitationPath, output);
console.log('Updated directions, moved navigation buttons into the car item, and added the bottom ETC entry.');
