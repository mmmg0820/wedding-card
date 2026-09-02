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

const dateTransition = html.match(/<section class="section date-transition"[\s\S]*?<\/section>/)?.[0];
if (!dateTransition) throw new Error('date transition section not found');
html = replaceOnce(html, dateTransition, '', 'remove November date transition');

const coupleSection = html.match(/<section class="section" id="couple">[\s\S]*?<\/section>/)?.[0];
if (!coupleSection) throw new Error('story section not found');
const familyStart = coupleSection.indexOf('<p class="family-line">');
if (familyStart < 0) throw new Error('family block not found');
const storyStart = coupleSection.indexOf('</h2>') + 5;
const storyCopy = `<p class="story-text">
    3년 전, 부다페스트에서 야경을 자랑하던 남자와<br>
    그 자랑을 가만히 들여다보던 여자는<br>
    이 도시에서 처음 서로를 마주했습니다.
  </p><p class="story-text">
    우리의 첫 시작 사이에 놓여 있던 거리 - <span class="story-highlight">8,131km</span><br>
    3년간 곁으로 가기 위해 달려온 거리 - <span class="story-highlight">201km</span>
  </p><p class="story-text">
    그리고 이제, 이야기가 시작된 이 도시에서,<br>
    가장 가까운 곳에 서서 남은 인생의 거리를<br>
    나란히 걸어가겠다는 약속을 전하려 합니다.
  </p><p class="story-text">
    저희가 써 내려갈 새로운 이야기의 첫 페이지를<br>
    함께 축복해 주시면 더없는 기쁨이겠습니다.
  </p>`;
const updatedCoupleSection = coupleSection.slice(0, storyStart) + storyCopy + coupleSection.slice(familyStart);
html = replaceOnce(html, coupleSection, updatedCoupleSection, 'replace story copy');

const galleryOverlay = `<div class="gallery-overlay"><span class="gallery-overlay-icon">🔨</span><span class="gallery-overlay-text">아직 뚝딱뚝딱중</span></div>`;
html = replaceOnce(html, galleryOverlay, '', 'remove gallery construction overlay');

const feedbackCss = `

  /* ---------- v3 story and open gallery feedback ---------- */
  .calendar-grid .wedding-day{
    background:rgba(67,71,75,.16);
    color:#ff817d;
  }
  .gallery-grid img{
    filter:none;
    transform:none;
    pointer-events:auto;
  }
`;
html = replaceOnce(html, '</style></head>', `${feedbackCss}</style></head>`, 'style closing tag');

if (html.includes('NOVEMBER 7, 2026')) throw new Error('November transition text remains');
if (html.includes('아직 뚝딱뚝딱중') || html.includes('<div class="gallery-overlay">')) throw new Error('gallery overlay remains');
if (!html.includes('부다페스트에서 야경을 자랑하던 남자와')) throw new Error('new story copy missing');
const body = html.slice(html.indexOf('<body'));
const expectedOrder = ['id="home"', 'id="couple"', 'id="events"', 'id="gallery"', 'id="map"'];
let previousIndex = -1;
for (const marker of expectedOrder) {
  const markerIndex = body.indexOf(marker);
  if (markerIndex < 0 || markerIndex <= previousIndex) throw new Error(`unexpected section order at ${marker}`);
  previousIndex = markerIndex;
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

console.log('Removed the date transition, updated the story, softened the selected day, and opened the gallery.');
