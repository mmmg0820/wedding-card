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
  `</div></div><section class="section" id="couple">`,
  `</div></div><section class="section date-transition" aria-label="예식 날짜"><div class="date-transition-inner"><span class="date-transition-month">NOV 7</span><span class="date-transition-year">2026</span></div></section><section class="section" id="couple">`,
  'date transition section',
);

const oldCalendarCss = `  .calendar-card{
    max-width:340px;
    margin:var(--gap-lg) auto 0;
    padding:24px;
    border:1px solid var(--line);
    border-radius:var(--radius);
    background:rgba(255,255,255,.62);
  }
  .calendar-heading{ text-align:center; margin-bottom:18px; }
  .calendar-heading strong{ display:block; font-size:1.05rem; }
  .calendar-heading span{ font-size:.78rem; color:var(--text-muted); }
  .calendar-grid{
    display:grid;
    grid-template-columns:repeat(7, 1fr);
    gap:6px;
    text-align:center;
    font-size:.75rem;
  }
  .calendar-grid b{ font-weight:500; color:var(--text-muted); }
  .calendar-grid span{ height:28px; display:grid; place-items:center; }
  .calendar-grid .wedding-day{
    width:28px;
    margin:auto;
    border-radius:50%;
    background:var(--accent);
    color:#fff;
    font-weight:600;
  }
`;
const newCalendarCss = `  .date-transition{
    min-height:72vh;
    padding:0;
    display:grid;
    place-items:center;
    overflow:hidden;
    background:#d5b75f;
    color:#fff;
  }
  .date-transition-inner{
    width:100%;
    display:flex;
    flex-direction:column;
    align-items:center;
    line-height:.96;
    font-family:'Noto Serif KR', serif;
    font-weight:300;
  }
  .date-transition-month,
  .date-transition-year{
    display:block;
    font-size:clamp(4.4rem, 22vw, 6.7rem);
    letter-spacing:-.06em;
    white-space:nowrap;
  }
  .date-transition-year{ margin-top:34px; }
  @keyframes dateFromLeft{
    from{ opacity:0; transform:translate3d(-70px,0,0); letter-spacing:.08em; }
    to{ opacity:1; transform:translate3d(0,0,0); letter-spacing:-.06em; }
  }
  @keyframes dateFromRight{
    from{ opacity:0; transform:translate3d(70px,0,0); letter-spacing:.08em; }
    to{ opacity:1; transform:translate3d(0,0,0); letter-spacing:-.06em; }
  }
  .motion-ready .date-transition-month,
  .motion-ready .date-transition-year{ opacity:0; }
  .motion-ready .date-transition.is-visible .date-transition-month{
    animation:dateFromLeft 1s cubic-bezier(.22,1,.36,1) .12s forwards;
  }
  .motion-ready .date-transition.is-visible .date-transition-year{
    animation:dateFromRight 1s cubic-bezier(.22,1,.36,1) .34s forwards;
  }

  .calendar-card{
    width:100%;
    max-width:360px;
    margin:var(--gap-lg) auto 0;
    padding:34px 0 0;
    border-top:1px solid var(--line);
    border-bottom:1px solid var(--line);
    background:rgba(255,255,255,.76);
  }
  .calendar-heading{ text-align:center; margin-bottom:28px; padding:0 14px; }
  .calendar-title{
    display:block;
    margin-bottom:16px;
    font-size:1.55rem;
    font-weight:300;
    letter-spacing:1.5px;
  }
  .calendar-korean{ margin:0; font-size:.82rem; color:var(--text); }
  .calendar-english{ margin:4px 0 0; font-size:.74rem; color:rgba(0,0,0,.38); }
  .calendar-grid{
    display:grid;
    grid-template-columns:repeat(7, 1fr);
    row-gap:13px;
    padding:22px 10px 28px;
    border-top:1px solid var(--line);
    text-align:center;
    font-size:.76rem;
  }
  .calendar-grid b{ height:27px; display:grid; place-items:center; font-weight:500; color:var(--text); }
  .calendar-grid b:first-child,
  .calendar-grid span:nth-of-type(7n+1){ color:#ee6b6b; }
  .calendar-grid span{ height:31px; display:grid; place-items:center; }
  .calendar-grid .wedding-day{
    width:31px;
    margin:auto;
    border-radius:50%;
    background:#d5b75f;
    color:#fff;
    font-weight:600;
  }
  .countdown{
    display:grid;
    grid-template-columns:repeat(4, minmax(0,1fr));
    gap:7px;
    padding:28px 0 0;
    transform:translateY(14px);
  }
  .countdown-unit{
    min-width:0;
    padding:13px 3px 11px;
    border-radius:8px;
    background:#fff;
    box-shadow:0 8px 18px rgba(0,0,0,.09);
    text-align:center;
  }
  .countdown-value{
    display:block;
    min-height:31px;
    font-size:1.18rem;
    font-variant-numeric:tabular-nums;
    transform-origin:center;
  }
  .countdown-value.tick{ animation:clockTick .42s cubic-bezier(.22,1,.36,1); }
  .countdown-label{
    display:block;
    margin-top:2px;
    font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;
    font-size:.56rem;
    letter-spacing:.5px;
    color:rgba(0,0,0,.35);
  }
  @keyframes clockTick{
    0%{ opacity:.2; transform:perspective(180px) rotateX(-72deg) translateY(-5px); }
    100%{ opacity:1; transform:perspective(180px) rotateX(0) translateY(0); }
  }
  @media (prefers-reduced-motion:reduce){
    .motion-ready .date-transition-month,
    .motion-ready .date-transition-year{
      opacity:1!important;
      animation:none!important;
      transform:none!important;
    }
    .countdown-value.tick{ animation:none!important; }
  }
`;
html = replaceOnce(html, oldCalendarCss, newCalendarCss, 'v3 date and calendar styles');

const oldCalendar = `<div class="calendar-card" aria-label="2026년 11월 달력"><div class="calendar-heading"><strong>2026. 11. 07.</strong><span>토요일 오후 2시</span></div><div class="calendar-grid"><b>일</b><b>월</b><b>화</b><b>수</b><b>목</b><b>금</b><b>토</b><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span class="wedding-day">7</span><span>8</span><span>9</span><span>10</span><span>11</span><span>12</span><span>13</span><span>14</span><span>15</span><span>16</span><span>17</span><span>18</span><span>19</span><span>20</span><span>21</span><span>22</span><span>23</span><span>24</span><span>25</span><span>26</span><span>27</span><span>28</span><span>29</span><span>30</span></div></div>`;
const newCalendar = `<div class="calendar-card" aria-label="2026년 11월 달력과 예식 카운트다운"><div class="calendar-heading"><strong class="calendar-title">WEDDING DAY</strong><p class="calendar-korean">2026년 11월 7일 토요일 | 오후 2시</p><p class="calendar-english">Saturday, November 7, 2026 | PM 2:00</p></div><div class="calendar-grid"><b>일</b><b>월</b><b>화</b><b>수</b><b>목</b><b>금</b><b>토</b><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span class="wedding-day">7</span><span>8</span><span>9</span><span>10</span><span>11</span><span>12</span><span>13</span><span>14</span><span>15</span><span>16</span><span>17</span><span>18</span><span>19</span><span>20</span><span>21</span><span>22</span><span>23</span><span>24</span><span>25</span><span>26</span><span>27</span><span>28</span><span>29</span><span>30</span></div><div class="countdown" aria-label="예식까지 남은 시간"><div class="countdown-unit"><span class="countdown-value" id="countdown-days">--</span><span class="countdown-label">DAYS</span></div><div class="countdown-unit"><span class="countdown-value" id="countdown-hours">--</span><span class="countdown-label">HOURS</span></div><div class="countdown-unit"><span class="countdown-value" id="countdown-minutes">--</span><span class="countdown-label">MINUTES</span></div><div class="countdown-unit"><span class="countdown-value" id="countdown-seconds">--</span><span class="countdown-label">SECONDS</span></div></div></div>`;
html = replaceOnce(html, oldCalendar, newCalendar, 'v3 calendar markup');

html = replaceOnce(
  html,
  `    renderAccounts();`,
  `    const weddingTime = new Date('2026-11-07T14:00:00+09:00').getTime();
    const countdownElements = {
      days: document.getElementById('countdown-days'),
      hours: document.getElementById('countdown-hours'),
      minutes: document.getElementById('countdown-minutes'),
      seconds: document.getElementById('countdown-seconds')
    };
    const setCountdownValue = (element, value) => {
      const next = String(value).padStart(2, '0');
      if (!element || element.textContent === next) return;
      element.textContent = next;
      element.classList.remove('tick');
      void element.offsetWidth;
      element.classList.add('tick');
    };
    const updateCountdown = () => {
      let remaining = Math.max(0, weddingTime - Date.now());
      const days = Math.floor(remaining / 86400000);
      remaining %= 86400000;
      const hours = Math.floor(remaining / 3600000);
      remaining %= 3600000;
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setCountdownValue(countdownElements.days, days);
      setCountdownValue(countdownElements.hours, hours);
      setCountdownValue(countdownElements.minutes, minutes);
      setCountdownValue(countdownElements.seconds, seconds);
    };
    updateCountdown();
    setInterval(updateCountdown, 1000);

    renderAccounts();`,
  'countdown initialization',
);

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
console.log('Added v3 date transition, redesigned calendar, and live countdown.');
