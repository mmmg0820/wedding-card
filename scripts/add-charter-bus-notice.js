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
const oldBus = '<div class="direction-item"><h3>셔틀버스</h3><p>노원역 8번 출구에서 예식일 오전 10시 30분 출발</p></div>';
let next = replaceOnce(html, oldBus, '');
if (next.includes('id="charter-bus"')) throw new Error('Notice already exists.');
const notice = `<section class="section charter-notice" id="charter-bus" aria-labelledby="charter-bus-title">
  <p class="charter-notice-eyebrow">NOTICE</p>
  <div class="charter-notice-card">
    <h2 id="charter-bus-title">전세버스</h2>
    <div class="charter-notice-illustration" aria-hidden="true">
      <svg viewBox="0 0 320 130" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <path d="M26 108H294" fill="none" stroke="#d8cdc5" stroke-width="2" stroke-linecap="round"/>
        <path d="M48 101V81M48 85c-22-6-17-27-4-21-9-23 15-30 19-11 18-9 28 15 7 23-2 9-11 15-22 9" fill="#dce2d3" stroke="#a6af99" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M90 40h129c14 0 26 11 26 25v31H83V50c0-6 2-10 7-10Z" fill="#f4e6dc" stroke="#a98c7f" stroke-width="2"/>
        <path d="M94 50h24v29H94zm33 0h25v29h-25zm34 0h25v29h-25zm34 0h22v43h-22zM225 52c9 3 12 10 12 20h-12Z" fill="#faf9f5" stroke="#a98c7f" stroke-width="1.5"/>
        <path d="M84 86h102M220 82h24" fill="none" stroke="#c79786" stroke-width="3"/>
        <circle cx="111" cy="98" r="11" fill="#827a74"/><circle cx="111" cy="98" r="5" fill="#e7ddd3"/>
        <circle cx="221" cy="98" r="11" fill="#827a74"/><circle cx="221" cy="98" r="5" fill="#e7ddd3"/>
        <path d="M261 103V89m-7 8 7-8 7 8" fill="none" stroke="#a6af99" stroke-width="2" stroke-linecap="round"/>
        <path d="M151 23c-10-10-17 4 0 12 17-8 10-22 0-12Z" fill="#c98d91"/>
      </svg>
    </div>
    <p class="charter-notice-intro">함께해 주시는 길이 조금 더 편안하도록<br>전세버스를 준비했습니다.</p>
    <dl class="charter-notice-details">
      <div><dt>출발 일시</dt><dd>11월 7일 토요일<br><strong>오전 10시 30분</strong></dd></div>
      <div><dt>탑승 장소</dt><dd><strong>노원역 8번 출구</strong></dd></div>
    </dl>
  </div>
</section>`;
const mapStart = next.indexOf('<section class="section" id="map">');
const mapEnd = next.indexOf('</section>', mapStart) + '</section>'.length;
if (mapStart < 0 || mapEnd < mapStart) throw new Error('Map section not found.');
next = next.slice(0, mapEnd) + notice + next.slice(mapEnd);
next = replaceOnce(next, '</style>', `
  /* A separate transport notice following the location section. */
  .charter-notice{ padding-top:40px; }
  .charter-notice-eyebrow{ margin:0 0 32px; text-align:center; color:var(--accent); font-size:.7rem; letter-spacing:3px; }
  .charter-notice-card{ position:relative; padding:32px 24px 28px; border:1px solid #cbb9ad; border-radius:20px; background:rgba(255,255,255,.35); }
  .charter-notice-card h2{ position:absolute; top:0; left:50%; transform:translate(-50%,-50%); margin:0; padding:7px 28px; border:1px solid #cbb9ad; border-radius:999px; background:var(--bg); font-size:1rem; font-weight:500; white-space:nowrap; }
  .charter-notice-illustration{ max-width:300px; margin:8px auto 20px; }
  .charter-notice-illustration svg{ display:block; width:100%; height:auto; }
  .charter-notice-intro{ margin:0 0 24px; text-align:center; font-size:.8rem; line-height:1.9; color:var(--text-muted); }
  .charter-notice-details{ margin:0; padding-top:20px; border-top:1px solid var(--line); font-size:.82rem; }
  .charter-notice-details > div{ display:grid; grid-template-columns:70px minmax(0,1fr); gap:12px; align-items:baseline; }
  .charter-notice-details > div + div{ margin-top:16px; }
  .charter-notice-details dt{ color:var(--text-muted); }
  .charter-notice-details dd{ margin:0; }
  .charter-notice-details strong{ font-weight:600; }
  @media(max-width:360px){
    .charter-notice{ padding-left:24px; padding-right:24px; }
    .charter-notice-card{ padding-left:18px; padding-right:18px; }
    .charter-notice-details > div{ grid-template-columns:60px minmax(0,1fr); gap:8px; }
  }
</style>`);
if (next.includes('셔틀버스')) throw new Error('Old bus name remains.');
if ((next.match(/id="charter-bus"/g) || []).length !== 1) throw new Error('Expected one notice.');
if (!(next.indexOf('id="map"') < next.indexOf('id="charter-bus"') && next.indexOf('id="charter-bus"') < next.indexOf('id="account"'))) throw new Error('Unexpected notice order.');
if ((next.match(/onclick="openMapApp\('/g) || []).length !== 5) throw new Error('Navigation buttons changed.');
const output = encrypt(next, passphrase, iterations);
if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed.');
fs.writeFileSync(invitationPath, output);
console.log('Added a separate NOTICE / 전세버스 card with the existing departure time and boarding location.');
