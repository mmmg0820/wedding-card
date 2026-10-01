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
let next = replaceOnce(html, '.menu-dialog{ width:min(360px,calc(100% - 40px)); max-height:calc(100dvh - 48px); overflow:auto; padding:28px; border:1px solid var(--line); border-radius:20px; background:var(--bg); color:var(--text); }', `.menu-dialog{ position:fixed; inset:auto auto 72px 20px; margin:0; width:min(280px,calc(100% - 40px)); max-height:calc(100dvh - 96px); overflow:auto; padding:20px; border:1px solid var(--line); border-radius:16px; background:var(--bg); color:var(--text); transform-origin:20px calc(100% + 32px); }
  .menu-dialog[open]{ animation:menuExpand .2s ease-out; }
  @keyframes menuExpand{ from{ opacity:0; transform:translateY(12px) scale(.85); } to{ opacity:1; transform:translateY(0) scale(1); } }
  @media(prefers-reduced-motion:reduce){ .menu-dialog[open]{ animation:none; } }`);
next = replaceOnce(next, '.menu-dialog h2{ margin:0 0 20px; text-align:center; font-size:1rem; }', '.menu-dialog h2{ margin:0 0 16px; text-align:left; font-size:.85rem; }');
next = replaceOnce(next, '.menu-links{ display:grid; gap:8px; }', '.menu-links{ display:grid; gap:6px; }');
next = replaceOnce(next, '.menu-links a{ display:flex; align-items:center; justify-content:center; min-height:48px; padding:10px; border:1px solid var(--line); border-radius:10px; text-decoration:none; font-size:.85rem; }', '.menu-links a{ display:flex; align-items:center; justify-content:flex-start; min-height:44px; padding:8px 12px; border:1px solid var(--line); border-radius:10px; text-decoration:none; font-size:.82rem; }');
const output = encrypt(next, passphrase, iterations);
if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed.');
fs.writeFileSync(invitationPath, output);
console.log('Anchored the expanding menu above its button.');
