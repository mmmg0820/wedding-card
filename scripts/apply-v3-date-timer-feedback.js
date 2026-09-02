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

html = replaceOnce(
  html,
  `<span class="date-transition-text">11월 7일 토요일, 오후 2시</span>`,
  `<span class="date-transition-text">NOVEMBER 7, 2026</span>`,
  'date transition text',
);

html = replaceOnce(
  html,
  `<ul class="event-info"><li><i class="fas fa-map-marker-alt"></i><span>대전 BMK웨딩홀 4층</span></li><li><i class="far fa-calendar-alt"></i><span>2026년 11월 7일 토요일, 오후 2시</span></li></ul>`,
  '',
  'event summary list',
);

const feedbackCss = `

  /* ---------- v3 date/timer feedback ---------- */
  .date-transition{
    min-height:0;
    padding:48px 24px;
  }
  .date-transition-text{
    font-family:'Noto Serif KR','Apple SD Gothic Neo',serif;
    font-size:clamp(1.35rem, 6.4vw, 2rem);
    font-weight:400;
    letter-spacing:.08em;
  }
  .calendar-grid .wedding-day{
    background:#43474b;
    color:#ff817d;
  }
  .countdown-unit{ background:rgba(255,255,255,.4); }
  .countdown-value{ font-size:calc(1.18rem + 4pt); }
`;
html = replaceOnce(html, '</style></head>', `${feedbackCss}</style></head>`, 'style closing tag');

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
console.log('Applied v3 date transition, selected day, timer, and event-summary feedback.');
