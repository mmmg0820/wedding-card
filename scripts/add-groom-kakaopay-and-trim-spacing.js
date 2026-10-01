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
let next = html;
const recipient = next.match(/\{ relation: "신랑", name: "이재상", bank: "[^"]+", number: "[^"]+" \}/g);
if (!recipient || recipient.length !== 1) throw new Error('Expected exactly one matching recipient.');
next = replaceOnce(next, recipient[0], recipient[0].replace(' }', ', kakaopayUrl: "https://qr.kakaopay.com/Ej80nJ4dY" }'));
const numberMarkup = '<div class="account-number">${maskAccountNumber(acc.number)}</div>';
const payMarkup = '${acc.kakaopayUrl ? `<a class="account-kakaopay" href="${acc.kakaopayUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" aria-label="${acc.name} 카카오페이로 마음 전하기 (새 창)">카카오페이</a>` : ""}';
next = replaceOnce(next, numberMarkup, numberMarkup + payMarkup);
next = replaceOnce(next, '  #map .directions{ margin-top:0; }', `  #map .directions{ margin-top:0; }
  /* Match the final transport row to the 18px rhythm between directions. */
  #map{ padding-bottom:18px; }
  #charter-bus{ padding-top:28px; }
  .account-kakaopay{ display:inline-flex; align-items:center; justify-content:center; min-height:44px; margin-top:10px; padding:8px 16px; border-radius:8px; background:#fee500; color:#191919; font-family:'Noto Sans KR',sans-serif; font-size:.78rem; font-weight:600; text-decoration:none; }
  .account-kakaopay:focus-visible{ outline:2px solid var(--accent); outline-offset:3px; }`);
if ((next.match(/kakaopayUrl: /g) || []).length !== 1) throw new Error('Only one recipient may have a payment link.');
const output = encrypt(next, passphrase, iterations);
if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed.');
fs.writeFileSync(invitationPath, output);
console.log('Added the supplied KakaoPay link to the groom only and reduced transport section spacing.');
