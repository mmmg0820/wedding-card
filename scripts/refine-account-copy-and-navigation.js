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

const passphrase = readAutoUnlockPassphrase();
const { html, iterations } = decrypt(fs.readFileSync(invitationPath), passphrase);
let next = replaceOnce(html, '<a href="#events">Wedding Day</a>', '<a href="#events">Day</a>');
const accountHeading = '<section class="section" id="account"><h2 class="section-title">마음 전하실 곳</h2>';
const copy = '<div class="account-intro"><p>참석이 어려움에도 축하의 마음을 전해주시는 분들을 위해 조심스럽게 안내 드립니다.</p><p>보내주신 축하와 응원에 힘입어 행복한 미래를 꾸려나가겠습니다.</p></div>';
next = replaceOnce(next, accountHeading, accountHeading + copy);
next = replaceOnce(next,
  `  /* Navigation items scroll horizontally when they exceed a narrow phone width. */
  .nav-inner{ gap:clamp(8px,2.5vw,16px); padding:8px 12px; justify-content:space-between; }
  .nav-inner a{ display:inline-flex; align-items:center; min-height:44px; font-size:clamp(10px,2.6vw,11.2px); letter-spacing:.25px; }`,
  `  /* Keep every menu visible; wrap to another row on smaller screens. */
  .nav-inner{ flex-wrap:wrap; gap:0 10px; padding:6px 10px; justify-content:center; overflow:visible; }
  .nav-inner a{ display:inline-flex; align-items:center; min-height:44px; font-size:.7rem; letter-spacing:.15px; }
  .account-intro{ margin:0 0 28px; text-align:center; color:var(--text-muted); font-size:.82rem; line-height:1.9; }
  .account-intro p{ margin:0; }
  .account-intro p + p{ margin-top:12px; }`);
if (!next.includes('class="calendar-title">WEDDING DAY</strong>')) throw new Error('Calendar title unexpectedly changed.');
if (!next.includes('id="charter-bus"') || !next.includes('id="bottom-etc"')) throw new Error('Existing notices must remain.');
const output = encrypt(next, passphrase, iterations);
if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed.');
fs.writeFileSync(invitationPath, output);
console.log('Added the account introduction and updated Day navigation with wrapping menu layout.');
