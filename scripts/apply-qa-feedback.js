const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');

const inputPath = process.argv[2] || 'docs/assets/invitation.enc';
const passphrase = process.env.INVITATION_PASSPHRASE;

if (!passphrase) {
  throw new Error('INVITATION_PASSPHRASE is required');
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Found ${label} more than once`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function decrypt(buffer) {
  if (buffer.subarray(0, 8).toString() !== 'WEDLOCK1') {
    throw new Error('Unsupported invitation format');
  }
  const iterations = buffer.readUInt32BE(8);
  const salt = buffer.subarray(12, 28);
  const iv = buffer.subarray(28, 40);
  const tag = buffer.subarray(40, 56);
  const ciphertext = buffer.subarray(56);
  const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), salt, iterations, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from('wedding-card-v1'));
  decipher.setAuthTag(tag);
  return {
    iterations,
    html: zlib.gunzipSync(Buffer.concat([decipher.update(ciphertext), decipher.final()])).toString('utf8'),
  };
}

function encrypt(html, iterations) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), salt, iterations, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('wedding-card-v1'));
  const ciphertext = Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(html))), cipher.final()]);
  const header = Buffer.alloc(12);
  header.write('WEDLOCK1');
  header.writeUInt32BE(iterations, 8);
  return Buffer.concat([header, salt, iv, cipher.getAuthTag(), ciphertext]);
}

let { html, iterations } = decrypt(fs.readFileSync(inputPath));

html = replaceOnce(html, '  /* ---------- Event ---------- */', `  /* ---------- Family / Calendar ---------- */
  .family-line{
    margin: var(--gap-lg) 0 0;
    text-align:center;
    font-size:0.9rem;
    line-height:2;
  }
  .family-line strong{ font-weight:600; }
  .calendar-card{
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

  /* ---------- Event ---------- */`, 'event style marker');

html = replaceOnce(html, '  /* ---------- Account ---------- */', `  .directions{
    display:grid;
    gap:18px;
    margin-top:var(--gap-lg);
  }
  .direction-item{
    padding-top:18px;
    border-top:1px solid var(--line);
  }
  .direction-item h3{ margin:0 0 6px; font-size:.9rem; }
  .direction-item p{ margin:0; color:var(--text-muted); font-size:.82rem; line-height:1.8; }
  .share-card{ text-align:center; }
  .share-card p{ margin:0 0 16px; color:var(--text-muted); font-size:.84rem; }
  .share-button{
    width:100%;
    padding:13px 16px;
    border:1px solid var(--accent);
    border-radius:var(--radius);
    background:var(--accent);
    color:#fff;
    font:inherit;
    cursor:pointer;
  }

  /* ---------- Account ---------- */`, 'account style marker');

html = replaceOnce(html, `  </p></section><section class="section" id="events">`, `  </p><p class="family-line">
    <strong>이우수 · 이은미</strong>의 아들 재상<br>
    <strong>이선아</strong>의 딸 진경
  </p></section><section class="section" id="events">`, 'family block');

html = replaceOnce(html, `<span>2026년 11월 7일, 오후 2시</span></li></ul></section>`, `<span>2026년 11월 7일 토요일, 오후 2시</span></li></ul><div class="calendar-card" aria-label="2026년 11월 달력"><div class="calendar-heading"><strong>2026. 11. 07.</strong><span>토요일 오후 2시</span></div><div class="calendar-grid"><b>일</b><b>월</b><b>화</b><b>수</b><b>목</b><b>금</b><b>토</b><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span class="wedding-day">7</span><span>8</span><span>9</span><span>10</span><span>11</span><span>12</span><span>13</span><span>14</span><span>15</span><span>16</span><span>17</span><span>18</span><span>19</span><span>20</span><span>21</span><span>22</span><span>23</span><span>24</span><span>25</span><span>26</span><span>27</span><span>28</span><span>29</span><span>30</span></div></div></section>`, 'calendar block');

html = replaceOnce(html, `</div></section><section class="section" id="account">`, `</div><div class="directions"><div class="direction-item"><h3>지하철</h3><p>대전 1호선 서대전네거리역 2번 출구에서 도보 약 10~12분</p></div><div class="direction-item"><h3>기차</h3><p>서대전역 1번 출구에서 도보로 이동하실 수 있습니다.</p></div><div class="direction-item"><h3>버스</h3><p>서대전네거리 정류장 하차 후 서대전공원·세이백화점 방향</p></div><div class="direction-item"><h3>자가용 · 주차</h3><p>내비게이션에 ‘The BMK 웨딩홀’을 검색해 주세요. 건물 주차장(약 600대)을 이용하실 수 있으며, 예식 주차 지원 방식은 확정 후 다시 안내드리겠습니다.</p></div></div></section><section class="section share-card" id="share"><h2 class="section-title">청첩장 공유</h2><p>아래 버튼을 눌러 이 청첩장 링크를 복사해 주세요.</p><button class="share-button" type="button" id="copy-invitation-link"><i class="fa fa-copy"></i> 청첩장 링크 복사하기</button></section><section class="section" id="account">`, 'directions and share blocks');

html = replaceOnce(html, `    renderAccounts();\n  });`, `    renderAccounts();

    document.getElementById('copy-invitation-link').addEventListener('click', async () => {
      const url = 'https://mmmg0820.github.io/wedding-card/';
      try {
        await navigator.clipboard.writeText(url);
      } catch (_) {
        const temp = document.createElement('textarea');
        temp.value = url;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        temp.remove();
      }
      showToast('청첩장 링크가 복사되었습니다');
    });
  });`, 'share handler');

fs.writeFileSync(inputPath, encrypt(html, iterations));
console.log('Applied QA feedback and re-encrypted invitation.');
