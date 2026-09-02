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

const oldNavigation = `    document.querySelectorAll('.nav-inner a[href^="#"]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        const targetId = link.getAttribute('href').slice(1);
        document.getElementById(targetId)?.scrollIntoView({ behavior:'smooth', block:'start' });
      });
    });`;

const newNavigation = `    const navigation = document.querySelector('.nav-inner');
    const navigationBar = document.querySelector('.nav-bar');
    let lastTouchNavigationAt = 0;
    const navigateToSection = link => {
      const targetId = link.getAttribute('href')?.slice(1);
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      const navigationHeight = navigationBar?.getBoundingClientRect().height || 0;
      const destination = Math.max(0, window.scrollY + target.getBoundingClientRect().top - navigationHeight);
      window.scrollTo({ top:window.scrollY, behavior:'auto' });
      requestAnimationFrame(() => window.scrollTo({ top:destination, behavior:'smooth' }));
    };
    const getNavigationLink = event => event.target.closest?.('.nav-inner a[href^="#"]');
    navigation?.addEventListener('touchend', event => {
      const link = getNavigationLink(event);
      if (!link) return;
      event.preventDefault();
      lastTouchNavigationAt = Date.now();
      navigateToSection(link);
    }, { passive:false });
    navigation?.addEventListener('click', event => {
      const link = getNavigationLink(event);
      if (!link) return;
      event.preventDefault();
      if (Date.now() - lastTouchNavigationAt < 500) return;
      navigateToSection(link);
    });`;
html = replaceOnce(html, oldNavigation, newNavigation, 'mobile section navigation');

const navigationCss = `

  /* ---------- repeatable mobile section navigation ---------- */
  .nav-inner a{
    touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;
  }
`;
html = replaceOnce(html, '</style></head>', `${navigationCss}</style></head>`, 'style closing tag');

for (const marker of ["addEventListener('touchend'", "{ passive:false }", 'lastTouchNavigationAt', "addEventListener('click'", "behavior:'auto'", "behavior:'smooth'"]) {
  if (!html.includes(marker)) throw new Error(`mobile navigation marker missing: ${marker}`);
}
if (html.includes("scrollIntoView({ behavior:'smooth', block:'start' })")) {
  throw new Error('old section navigation remains');
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

console.log('Made mobile section navigation repeatable across consecutive taps.');
