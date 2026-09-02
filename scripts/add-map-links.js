const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');

const path = process.argv[2] || 'docs/assets/invitation.enc';
const passphrase = process.env.INVITATION_PASSPHRASE;
if (!passphrase) throw new Error('INVITATION_PASSPHRASE is required');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected once, found ${count}`);
  return source.replace(before, after);
}

const encrypted = fs.readFileSync(path);
if (encrypted.subarray(0, 8).toString() !== 'WEDLOCK1') throw new Error('Unsupported format');
const iterations = encrypted.readUInt32BE(8);
const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), encrypted.subarray(12, 28), iterations, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(28, 40));
decipher.setAAD(Buffer.from('wedding-card-v1'));
decipher.setAuthTag(encrypted.subarray(40, 56));
let html = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(56)), decipher.final()])).toString('utf8');

html = replaceOnce(html, `  .map-links{
    display:flex;
    justify-content:center;
    gap: var(--gap-md);
    margin-bottom: var(--gap-lg);
  }
  .map-links a{
    display:flex;
    align-items:center;
    justify-content:center;
    width:40px;
    height:40px;
    border:1px solid var(--line);
    border-radius:50%;
    transition: border-color .2s;
  }
  .map-links a:hover{ border-color: var(--accent); }
  .map-links img{ width:20px; height:20px; }
`, `  .map-links{
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
  .map-service-mark{ font-weight:700; color:var(--accent); }
`, 'map link styles');

html = replaceOnce(html, `<div class="map-links"><a id="link-naver" target="_blank"><img id="img-map-naver" alt="naver-map"/></a><a id="link-kakao" target="_blank"><img id="img-map-kakao" alt="kakao-map"/></a><a id="link-google" target="_blank"><img id="img-map-google" alt="google-map"/></a></div>`, `<div class="map-links" aria-label="지도 및 내비게이션 바로가기"><a href="https://map.naver.com/p/search/BMK%EC%9B%A8%EB%94%A9%ED%99%80" target="_blank" rel="noopener"><span class="map-service-mark">N</span>네이버지도</a><button type="button" onclick="openNavigation('kakaonavi')"><span class="map-service-mark">K</span>카카오내비</button><a href="https://map.kakao.com/?q=BMK%EC%BB%A8%EB%B2%A4%EC%85%98" target="_blank" rel="noopener"><span class="map-service-mark">K</span>카카오맵</a><button type="button" onclick="openNavigation('tmap')"><span class="map-service-mark">T</span>티맵</button><a class="map-google" href="https://www.google.com/maps/search/?api=1&amp;query=%EB%8C%80%EC%A0%84+%EC%A4%91%EA%B5%AC+%EC%84%9C%EB%AC%B8%EB%A1%9C+133+BMK%EC%BB%A8%EB%B2%A4%EC%85%98" target="_blank" rel="noopener"><span class="map-service-mark">G</span>구글지도</a></div>`, 'map link markup');

html = replaceOnce(html, `    document.getElementById("img-map-naver").src = CONFIG.map.naverIcon;
    document.getElementById("link-naver").href = CONFIG.map.naverUrl;
    document.getElementById("img-map-kakao").src = CONFIG.map.kakaoIcon;
    document.getElementById("link-kakao").href = CONFIG.map.kakaoUrl;
    document.getElementById("img-map-google").src = CONFIG.map.googleIcon;
    document.getElementById("link-google").href = CONFIG.map.googleUrl;

`, '', 'old map initialization');

html = replaceOnce(html, `  function maskAccountNumber(number){`, `  function openNavigation(app){
    const name = encodeURIComponent('The BMK 웨딩홀');
    const lat = '36.3198898';
    const lng = '127.4051471';
    const fallback = 'https://map.kakao.com/?q=BMK%EC%BB%A8%EB%B2%A4%EC%85%98';
    const scheme = app === 'kakaonavi'
      ? \`kakaonavi://navigate?name=\${name}&x=\${lng}&y=\${lat}&coord_type=wgs84\`
      : \`tmap://route?goalname=\${name}&goalx=\${lng}&goaly=\${lat}\`;
    let hidden = false;
    const onVisibility = () => { if (document.hidden) hidden = true; };
    document.addEventListener('visibilitychange', onVisibility, { once:true });
    window.location.href = scheme;
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (!hidden) window.open(fallback, '_blank', 'noopener');
    }, 1200);
  }

  function maskAccountNumber(number){`, 'navigation handler');

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
console.log('Added five map services and re-encrypted invitation.');
