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

const passphrase = readAutoUnlockPassphrase();
const { html, iterations } = decrypt(fs.readFileSync(invitationPath), passphrase);

const before = `    const target = targets[service];
    if (!target) return;
    let appOpened = false;
    const markOpened = () => { if (document.hidden) appOpened = true; };
    document.addEventListener('visibilitychange', markOpened);
    window.location.href = target.app;
    setTimeout(() => {
      document.removeEventListener('visibilitychange', markOpened);
      if (!appOpened) window.location.href = target.web;
    }, 1400);`;

const after = `    const target = targets[service];
    if (!target) return;
    window.open(target.web, '_blank', 'noopener');`;

if (!html.includes(before)) {
  throw new Error('Expected map opening block was not found.');
}
if (html.includes(after)) {
  throw new Error('Map opening block is already patched.');
}

const nextHtml = html.replace(before, after);
if (nextHtml.includes('window.location.href = target.app') || nextHtml.includes('window.location.href = target.web')) {
  throw new Error('Unsafe iframe navigation code remains.');
}
if (!nextHtml.includes("window.open(target.web, '_blank', 'noopener')")) {
  throw new Error('New-tab map opening code was not inserted.');
}

fs.writeFileSync(invitationPath, encrypt(nextHtml, passphrase, iterations));
console.log('Patched map buttons to open web maps in a new tab.');
