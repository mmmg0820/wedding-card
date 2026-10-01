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

const groups = [
  ['테이크아웃으로 즐겨요', [
    ['신동명의 커피공간', '대전 중구 과례로 94', '집으로 가는 길에 필요한 맛있는 커피. 원두를 선택할 수 있어요.'],
    ['다다제과점', '대전 중구 중교로 11', '샌드베이글 맛집'],
    ['굿베이글', '대전 중구 과례로 74-29', '베이글 맛집'],
  ]],
  ['빵의 도시, 대전', [
    ['성심당 롯데백화점 대전점', '대전 서구 계룡로 598', '롯데백화점에 주차할 수 있어 편리해요.'],
  ]],
  ['예식장 근처에서 커피 한 잔', [
    ['평생직장커피', '대전 중구 계룡로874번길 71', '분위기 좋은 카페'],
    ['넛팅', '대전 중구 오류로 31', '깔끔한 카페'],
    ['카페코지', '대전 중구 계룡로882번길 106', '분위기 좋은 카페'],
  ]],
  ['중심가에서 디저트와 커피', [
    ['로로네베이커리', '대전 중구 중교로 30', '빵과 커피 한 잔'],
    ['하이드아웃', '대전 중구 대흥로121번길 17', '케이크와 커피 한 잔'],
    ['땡큐베리머치', '대전 중구 중교로 49', '케이크와 커피 한 잔'],
    ['무의식', '대전 중구 선화서로 42', '티라미수와 커피 한 잔'],
  ]],
  ['밀가루의 도시, 대전', [
    ['장원갑칼국수 대전중구점', '대전 중구 대종로 450 1층', '조치원 본점보다 맛있다고 알려진 곳'],
    ['오씨칼국수', '대전 동구 옛신탄진로 13', ''],
    ['태화장', '대전 동구 중앙로203번길 78', ''],
  ]],
];
const escape = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const guide = `<section class="section" id="local-guide" aria-labelledby="local-guide-title">
  <p class="local-guide-eyebrow">잠시 더 머무는 대전</p>
  <h2 class="section-title" id="local-guide-title">맛집 안내</h2>
  <p class="local-guide-intro">먼 길 와주신 여러분께<br>들러보셨으면 하는 곳들을 소개합니다.</p>
  ${groups.map(([title, places]) => `<details class="local-guide-group"><summary>${escape(title)}<span class="local-guide-count">${places.length}곳</span></summary><ul>${places.map(([name, address, note]) => `<li><h3>${escape(name)}</h3>${note ? `<p class="local-guide-note">${escape(note)}</p>` : ''}<p class="local-guide-address">${escape(address)}</p><a href="https://map.naver.com/p/search/${encodeURIComponent(name + ' ' + address)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(name)} 네이버지도에서 보기 (새 창)">지도 보기 <span aria-hidden="true">↗</span></a></li>`).join('')}</ul></details>`).join('\n')}
</section>`;

const passphrase = readAutoUnlockPassphrase();
const { html, iterations } = decrypt(fs.readFileSync(invitationPath), passphrase);
if (html.includes('id="local-guide"')) throw new Error('Local guide is already installed.');
// Use the embed endpoint returned by Google, without the general Maps redirect.
const embedUrl = 'https://www.google.com/maps/embed?origin=mfe&pb=!1m2!2m1!1z64yA7KCE6rSR7Jet7IucIOykkeq1rCDshJzrrLjroZwgMTMzIEJNS-y7qOuypOyFmA';
const oldMap = '<div class="map-frame"><iframe src="https://www.google.com/maps?q=대전광역시+중구+서문로+133+BMK컨벤션&output=embed" loading="lazy" allowfullscreen></iframe></div>';
const newMap = `<div class="map-frame"><iframe id="venue-map" title="BMK웨딩홀 위치 지도" src="${escape(embedUrl)}" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><div class="map-recovery"><p>지도가 보이지 않으면 새로고침하거나 새 창에서 열어주세요.</p><div><button type="button" onclick="const map=document.getElementById('venue-map'); map.src=map.src;">지도 새로고침</button><a href="https://map.naver.com/p/search/${encodeURIComponent('BMK웨딩홀 대전 중구 서문로 133')}" target="_blank" rel="noopener noreferrer">새 창에서 보기 ↗</a></div></div>`;
let next = replaceOnce(html, oldMap, newMap);
const lastSectionEnd = next.lastIndexOf('</section>') + '</section>'.length;
if (lastSectionEnd < '</section>'.length) throw new Error('Final section not found.');
next = next.slice(0, lastSectionEnd) + guide + next.slice(lastSectionEnd);
const css = `
  /* Keep the external map visible independently of scroll animation/lazy loading. */
  #map > .map-frame, #map > .map-recovery{
    opacity:1; transform:none; filter:none; clip-path:none;
    transition:none; will-change:auto;
  }
  #map .map-frame{ margin-bottom:12px; background:var(--bg-soft); }
  .map-recovery{ margin-bottom:var(--gap-lg); text-align:center; }
  .map-recovery p{ margin:0 0 8px; font-size:.72rem; color:var(--text-muted); }
  .map-recovery > div{ display:flex; justify-content:center; flex-wrap:wrap; gap:8px; }
  .map-recovery button, .map-recovery a{
    display:inline-flex; align-items:center; justify-content:center; min-height:44px;
    padding:8px 12px; border:1px solid var(--line); border-radius:var(--radius);
    background:var(--bg-soft); color:var(--text); font:inherit; font-size:.75rem;
    text-decoration:none; cursor:pointer;
  }
  .local-guide-eyebrow{ margin:0 0 8px; text-align:center; font-size:.75rem; color:var(--accent); }
  #local-guide .section-title{ margin-bottom:16px; }
  .local-guide-intro{ margin:0 0 28px; text-align:center; font-size:.82rem; color:var(--text-muted); }
  .local-guide-group{ border-top:1px solid var(--line); }
  .local-guide-group:last-child{ border-bottom:1px solid var(--line); }
  .local-guide-group summary{ padding:18px 0; cursor:pointer; font-size:.82rem; }
  .local-guide-count{ margin-left:8px; color:var(--text-muted); font-size:.7rem; white-space:nowrap; }
  .local-guide-group ul{ list-style:none; margin:0; padding:0 0 8px; }
  .local-guide-group li{ padding:16px; margin-bottom:12px; background:var(--bg-soft); border-radius:var(--radius); }
  .local-guide-group h3{ margin:0 0 6px; font-size:.86rem; }
  .local-guide-group p{ margin:4px 0; font-size:.76rem; overflow-wrap:anywhere; }
  .local-guide-address{ color:var(--text-muted); }
  .local-guide-group a{ display:inline-flex; align-items:center; gap:6px; min-height:44px; color:var(--accent); font-size:.78rem; text-underline-offset:4px; }
  .local-guide-group summary:focus-visible, .local-guide-group a:focus-visible,
  .map-recovery button:focus-visible, .map-recovery a:focus-visible{ outline:2px solid var(--accent); outline-offset:3px; }
`;
next = replaceOnce(next, '</style></head>', css + '</style></head>');
if ((guide.match(/<li>/g) || []).length !== 14) throw new Error('Expected 14 places.');
if (next.lastIndexOf('<section ') !== next.indexOf('<section class="section" id="local-guide"')) throw new Error('Guide must be the final section.');
const output = encrypt(next, passphrase, iterations);
if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed.');
fs.writeFileSync(invitationPath, output);
console.log('Added 14 local recommendations and resilient venue map loading/recovery.');
