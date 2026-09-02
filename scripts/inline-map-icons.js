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

function dataUrl(path, mime) {
  return `data:${mime};base64,${fs.readFileSync(path).toString('base64')}`;
}

const icons = {
  naver: ['네이버지도', dataUrl('docs/images/map-icons/naver-map.webp', 'image/webp')],
  kakaonavi: ['카카오내비', dataUrl('docs/images/map-icons/kakao-navi.svg', 'image/svg+xml')],
  kakaomap: ['카카오맵', dataUrl('docs/images/map-icons/kakao-map.png', 'image/png')],
  tmap: ['티맵', dataUrl('docs/images/map-icons/tmap.svg', 'image/svg+xml')],
  google: ['구글지도', dataUrl('docs/images/map-icons/google-maps.webp', 'image/webp')],
};

const encrypted = fs.readFileSync(invitationPath);
const iterations = encrypted.readUInt32BE(8);
const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), encrypted.subarray(12, 28), iterations, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(28, 40));
decipher.setAAD(Buffer.from('wedding-card-v1'));
decipher.setAuthTag(encrypted.subarray(40, 56));
let html = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(56)), decipher.final()])).toString('utf8');

const oldCss = `  .map-links{
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:10px;
    margin-bottom:var(--gap-lg);
  }
  .map-links a,
  .map-links button{
    min-height:44px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:7px;
    padding:10px 8px;
    border:1px solid var(--line);
    border-radius:var(--radius);
    background:var(--bg-soft);
    color:var(--text);
    font:inherit;
    font-size:.78rem;
    text-decoration:none;
    cursor:pointer;
    transition:border-color .2s, background .2s;
  }
  .map-links a:hover,
  .map-links button:hover{ border-color:var(--accent); background:var(--accent-surface); }
  .map-links .map-google{ grid-column:1 / -1; }
  .map-service-icon{
    width:24px;
    height:24px;
    flex:0 0 24px;
    display:block;
    border-radius:6px;
  }
`;
const newCss = `  .map-links{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:14px;
    margin-bottom:var(--gap-lg);
  }
  .map-links button{
    width:48px;
    height:48px;
    flex:0 0 48px;
    display:grid;
    place-items:center;
    padding:7px;
    border:1px solid var(--line);
    border-radius:50%;
    background:var(--bg-soft);
    cursor:pointer;
    transition:border-color .2s, transform .2s;
  }
  .map-links button:hover{ border-color:var(--accent); transform:translateY(-1px); }
  .map-service-icon{
    width:32px;
    height:32px;
    display:block;
    object-fit:contain;
    border-radius:7px;
  }
`;
html = replaceOnce(html, oldCss, newCss, 'map icon layout');

for (const [service, [label, source]] of Object.entries(icons)) {
  const pattern = new RegExp(`(<button[^>]*onclick="openMapApp\\('${service}'\\)"[^>]*>)[\\s\\S]*?(</button>)`);
  if (!pattern.test(html)) throw new Error(`Could not find ${service} button`);
  html = html.replace(pattern, `$1<img class="map-service-icon" src="${source}" alt="${label}">$2`);
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
console.log('Inlined five map icons and arranged them in one row.');
