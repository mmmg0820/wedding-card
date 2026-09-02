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
  `<span class="hero-watermark">초대용 · 무단 사용 금지</span>`,
  '',
  'hero watermark',
);
html = replaceOnce(
  html,
  `<span class="photo-watermark">초대용 · 무단 사용 금지</span>`,
  '',
  'event photo watermark',
);
html = replaceOnce(
  html,
  `        const watermark = document.createElement("span");
        watermark.className = "photo-watermark";
        watermark.textContent = "초대용 · 무단 사용 금지";
        item.append(image, watermark);`,
  `        item.append(image);`,
  'gallery watermark creation',
);

html = replaceOnce(
  html,
  `<section class="section share-card" id="share"><h2 class="section-title">청첩장 공유</h2><p>아래 버튼을 눌러 이 청첩장 링크를 복사해 주세요.</p><button class="share-button" type="button" id="copy-invitation-link"><i class="fa fa-copy"></i> 청첩장 링크 복사하기</button></section>`,
  '',
  'invitation share section',
);
html = replaceOnce(
  html,
  `
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
    });`,
  '',
  'invitation share handler',
);

html = replaceOnce(
  html,
  `    renderAccounts();`,
  `    document.querySelectorAll('.nav-inner a[href^="#"]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        const targetId = link.getAttribute('href').slice(1);
        document.getElementById(targetId)?.scrollIntoView({ behavior:'smooth', block:'start' });
      });
    });

    renderAccounts();`,
  'internal navigation handler',
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
console.log('Fixed internal navigation and removed watermarks/share section.');
