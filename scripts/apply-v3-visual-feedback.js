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
  `family=Noto+Serif+KR:wght@300;400;500;600;700&display=swap`,
  `family=Nanum+Pen+Script&family=Noto+Serif+KR:wght@300;400;500;600;700&display=swap`,
  'Google font request',
);

html = replaceOnce(
  html,
  `<section class="section date-transition" aria-label="예식 날짜"><div class="date-transition-inner"><span class="date-transition-month">NOV 7</span><span class="date-transition-year">2026</span></div></section>`,
  `<section class="section date-transition" aria-label="예식 날짜"><div class="date-transition-inner"><span class="date-transition-text">11월 7일 토요일, 오후 2시</span></div></section>`,
  'date transition text',
);

html = replaceOnce(
  html,
  `<strong class="calendar-title">WEDDING DAY</strong><p class="calendar-korean">`,
  `<strong class="calendar-title">WEDDING DAY</strong><span class="calendar-accent" aria-hidden="true"></span><p class="calendar-korean">`,
  'calendar title accent',
);

const feedbackCss = `

  /* ---------- v3 visual feedback ---------- */
  .date-transition{
    min-height:48vh;
    background:var(--bg);
    color:#292826;
  }
  .date-transition-inner{ line-height:1.25; }
  .date-transition-text{
    display:block;
    width:100%;
    padding:0 18px;
    font-family:'Nanum Pen Script','Apple SD Gothic Neo',cursive;
    font-size:clamp(1.85rem, 8.2vw, 2.65rem);
    font-weight:400;
    letter-spacing:0;
    text-align:center;
    white-space:nowrap;
  }
  @keyframes dateInkReveal{
    from{ opacity:0; transform:translate3d(0,20px,0) scale(.97); filter:blur(5px); }
    to{ opacity:1; transform:translate3d(0,0,0) scale(1); filter:blur(0); }
  }
  .motion-ready .date-transition-text{ opacity:0; }
  .motion-ready .date-transition.is-visible .date-transition-text{
    animation:dateInkReveal 1.15s cubic-bezier(.22,1,.36,1) .14s forwards;
  }

  .calendar-card{
    max-width:360px;
    padding:0;
    border:0;
    background:transparent;
  }
  .calendar-heading{
    margin:0 0 22px;
    padding:34px 18px 28px;
    border-radius:12px;
    background:#fff;
    box-shadow:0 8px 24px rgba(0,0,0,.045);
  }
  .calendar-title{ margin-bottom:10px; }
  .calendar-accent{
    display:block;
    width:38px;
    height:3px;
    margin:0 auto 18px;
    border-radius:999px;
    background:#d5b75f;
  }
  .calendar-grid{
    padding:8px 10px 0;
    border:0;
    background:transparent;
  }
  .calendar-grid b:nth-child(7),
  .calendar-grid span:nth-of-type(7n){ color:var(--accent); }
  .calendar-grid .wedding-day{ color:#fff; }
  .countdown{
    margin-top:30px;
    padding:0;
    transform:none;
  }
  .countdown-value{ font-size:calc(1.18rem + 2pt); }

  @media (prefers-reduced-motion:reduce){
    .motion-ready .date-transition-text{
      opacity:1!important;
      animation:none!important;
      transform:none!important;
      filter:none!important;
    }
  }
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
console.log('Applied v3 date, calendar, and countdown visual feedback.');
