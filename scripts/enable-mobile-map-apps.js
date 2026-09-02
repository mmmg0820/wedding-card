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
const iterations = encrypted.readUInt32BE(8);
const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), encrypted.subarray(12, 28), iterations, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(28, 40));
decipher.setAAD(Buffer.from('wedding-card-v1'));
decipher.setAuthTag(encrypted.subarray(40, 56));
let html = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(56)), decipher.final()])).toString('utf8');

html = replaceOnce(html, `  .map-service-mark{ font-weight:700; color:var(--accent); }`, `  .map-service-icon{
    width:24px;
    height:24px;
    flex:0 0 24px;
    display:block;
    border-radius:6px;
  }`, 'temporary map icon style');

const oldLinks = `<div class="map-links" aria-label="지도 및 내비게이션 바로가기"><a href="https://map.naver.com/p/search/BMK%EC%9B%A8%EB%94%A9%ED%99%80" target="_blank" rel="noopener"><span class="map-service-mark">N</span>네이버지도</a><button type="button" onclick="openNavigation('kakaonavi')"><span class="map-service-mark">K</span>카카오내비</button><a href="https://map.kakao.com/?q=BMK%EC%BB%A8%EB%B2%A4%EC%85%98" target="_blank" rel="noopener"><span class="map-service-mark">K</span>카카오맵</a><button type="button" onclick="openNavigation('tmap')"><span class="map-service-mark">T</span>티맵</button><a class="map-google" href="https://www.google.com/maps/search/?api=1&amp;query=%EB%8C%80%EC%A0%84+%EC%A4%91%EA%B5%AC+%EC%84%9C%EB%AC%B8%EB%A1%9C+133+BMK%EC%BB%A8%EB%B2%A4%EC%85%98" target="_blank" rel="noopener"><span class="map-service-mark">G</span>구글지도</a></div>`;
const newLinks = `<div class="map-links" aria-label="지도 및 내비게이션 바로가기">
  <button type="button" onclick="openMapApp('naver')" aria-label="네이버지도 앱으로 열기"><svg class="map-service-icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#03C75A"/><path d="M12 4.5a6.2 6.2 0 0 0-6.2 6.2c0 4.5 6.2 9.1 6.2 9.1s6.2-4.6 6.2-9.1A6.2 6.2 0 0 0 12 4.5Z" fill="#fff"/><path d="M9 14V8h1.7l2.6 3.5V8H15v6h-1.7l-2.6-3.5V14H9Z" fill="#03C75A"/></svg>네이버지도</button>
  <button type="button" onclick="openMapApp('kakaonavi')" aria-label="카카오내비 앱으로 열기"><svg class="map-service-icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FEE500"/><path d="M12 3.8 19 19l-7-3-7 3 7-15.2Z" fill="#171717"/><path d="m12 8.2 2.6 7.3-2.6-1.1-2.6 1.1L12 8.2Z" fill="#FEE500"/></svg>카카오내비</button>
  <button type="button" onclick="openMapApp('kakaomap')" aria-label="카카오맵 앱으로 열기"><svg class="map-service-icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FEE500"/><path d="M12 4.3a6.1 6.1 0 0 0-6.1 6.1c0 4.3 6.1 9.3 6.1 9.3s6.1-5 6.1-9.3A6.1 6.1 0 0 0 12 4.3Z" fill="#3C1E1E"/><circle cx="12" cy="10.4" r="2.2" fill="#FEE500"/></svg>카카오맵</button>
  <button type="button" onclick="openMapApp('tmap')" aria-label="티맵 앱으로 열기"><svg class="map-service-icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#fff"/><path d="M4.2 5.3h15.6l-6.1 6.1v7.3h-3.4v-7.3L4.2 5.3Z" fill="#E6244F"/><path d="m12 11.4 3.5-3.5h-7L12 11.4Z" fill="#7B2CE2"/></svg>티맵</button>
  <button class="map-google" type="button" onclick="openMapApp('google')" aria-label="구글지도 앱으로 열기"><svg class="map-service-icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#fff"/><path d="M12 3.5a6.5 6.5 0 0 0-6.5 6.5c0 4.8 6.5 10.5 6.5 10.5s6.5-5.7 6.5-10.5A6.5 6.5 0 0 0 12 3.5Z" fill="#EA4335"/><path d="M12 3.5a6.5 6.5 0 0 1 5.6 3.2L12 10Z" fill="#4285F4"/><path d="M6.4 6.7A6.5 6.5 0 0 0 5.5 10c0 1.3.5 2.7 1.3 4L12 10 6.4 6.7Z" fill="#34A853"/><path d="M6.8 14c1.9 3.3 5.2 6.5 5.2 6.5s2.2-2 4.1-4.5L12 10 6.8 14Z" fill="#FBBC04"/><circle cx="12" cy="10" r="2.3" fill="#fff"/></svg>구글지도</button>
</div>`;
html = replaceOnce(html, oldLinks, newLinks, 'five map buttons');

const oldHandler = `  function openNavigation(app){
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
`;
const newHandler = `  function openMapApp(service){
    const name = encodeURIComponent('The BMK 웨딩홀');
    const query = encodeURIComponent('대전 중구 서문로 133 The BMK 웨딩홀');
    const lat = '36.3198898';
    const lng = '127.4051471';
    const android = /Android/i.test(navigator.userAgent);
    const targets = {
      naver: {
        app: \`nmap://search?query=\${query}&appname=https%3A%2F%2Fmmmg0820.github.io%2Fwedding-card%2F\`,
        web: \`https://map.naver.com/p/search/\${query}\`
      },
      kakaonavi: {
        app: \`kakaonavi://navigate?name=\${name}&x=\${lng}&y=\${lat}&coord_type=wgs84\`,
        web: \`https://map.kakao.com/link/to/\${name},\${lat},\${lng}\`
      },
      kakaomap: {
        app: \`kakaomap://search?q=\${query}\`,
        web: \`https://map.kakao.com/?q=\${query}\`
      },
      tmap: {
        app: \`tmap://route?goalname=\${name}&goalx=\${lng}&goaly=\${lat}\`,
        web: \`https://www.tmap.co.kr/search?searchKeyword=\${query}\`
      },
      google: {
        app: android ? \`geo:0,0?q=\${lat},\${lng}(\${name})\` : \`comgooglemaps://?q=\${query}&center=\${lat},\${lng}\`,
        web: \`https://www.google.com/maps/search/?api=1&query=\${query}\`
      }
    };
    const target = targets[service];
    if (!target) return;
    let appOpened = false;
    const markOpened = () => { if (document.hidden) appOpened = true; };
    document.addEventListener('visibilitychange', markOpened);
    window.location.href = target.app;
    setTimeout(() => {
      document.removeEventListener('visibilitychange', markOpened);
      if (!appOpened) window.location.href = target.web;
    }, 1400);
  }
`;
html = replaceOnce(html, oldHandler, newHandler, 'map app handler');

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
console.log('Enabled app-first map links with embedded SVG icons.');
