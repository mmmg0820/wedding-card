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

const layoutCss = `

  /* ---------- v3 Wedding Day section order ---------- */
  #events .calendar-card{ margin-top:0; }
  #events .photo-watermarked{
    margin-top:calc(var(--gap-lg) + 14px);
    margin-bottom:0;
  }
`;

if (html.includes('<h2 class="section-title">초대합니다</h2>')) {
  const transitionSection = html.match(/<section class="section date-transition"[\s\S]*?<\/section>/)?.[0];
  if (!transitionSection) throw new Error('date transition section not found');
  html = replaceOnce(html, transitionSection, '', 'remove date transition from old position');
  html = replaceOnce(
    html,
    `</p></section><section class="section" id="events">`,
    `</p></section>${transitionSection}<section class="section" id="events">`,
    'place date transition after story',
  );

  const eventSection = html.match(/<section class="section" id="events">[\s\S]*?<\/section>/)?.[0];
  if (!eventSection) throw new Error('events section not found');
  const calendar = eventSection.match(/<div class="calendar-card"[\s\S]*?<\/div><\/div><\/div>/)?.[0];
  const photo = eventSection.match(/<div class="photo-watermarked">[\s\S]*?<\/div>/)?.[0];
  if (!calendar || !photo) throw new Error('calendar or event photo not found');
  const reorderedEventSection = `<section class="section" id="events">${calendar}${photo}</section>`;
  html = replaceOnce(html, eventSection, reorderedEventSection, 'calendar-first events section');

  html = replaceOnce(html, `<a href="#events">Events</a>`, `<a href="#events">Wedding Day</a>`, 'events navigation label');
  html = replaceOnce(html, '</style></head>', `${layoutCss}</style></head>`, 'style closing tag');
} else if (html.includes('/* ---------- v3 Wedding Day section order ---------- */')) {
  const correctBoundary = `</div></div></div><div class="photo-watermarked">`;
  if (!html.includes(correctBoundary)) {
    html = replaceOnce(
      html,
      `</div></div><div class="photo-watermarked">`,
      correctBoundary,
      'repair calendar closing tag from interrupted first run',
    );
  }
} else {
  throw new Error('v3 Wedding Day layout is neither original nor recognized');
}

const expectedOrder = [
  '<section class="hero" id="home"',
  '<section class="section" id="couple"',
  '<section class="section date-transition"',
  '<section class="section" id="events"',
  '<section class="section" id="gallery"',
  '<section class="section" id="map"',
];
let previousIndex = -1;
for (const marker of expectedOrder) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0 || markerIndex <= previousIndex) throw new Error(`unexpected section order at ${marker}`);
  previousIndex = markerIndex;
}
if (html.includes('<h2 class="section-title">초대합니다</h2>')) throw new Error('old events heading remains');
if (html.indexOf('calendar-card') > html.indexOf('id="img-event"')) throw new Error('event photo still precedes calendar');

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

console.log('Reordered v3 story, date transition, Wedding Day calendar, and event photo.');
