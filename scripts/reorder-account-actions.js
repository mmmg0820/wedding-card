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
const payment = '${acc.kakaopayUrl ? `<a class="account-kakaopay" href="${acc.kakaopayUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" aria-label="${acc.name} 카카오페이로 마음 전하기 (새 창)">카카오페이</a>` : ""}';
let next = replaceOnce(html, payment, '');
next = replaceOnce(next, '<span class="account-copy-hint"><i class="fa fa-copy"></i>복사</span>', '<div class="account-actions">' + payment + '<button type="button" class="account-copy-hint" onclick="event.stopPropagation(); copyAccount(this.closest(\'.account-card\'))"><i class="fa fa-copy" aria-hidden="true"></i>계좌번호 복사</button></div>');
next = replaceOnce(next, '</style>', `
  .account-actions{ display:flex; flex-direction:column; align-items:stretch; gap:8px; flex-shrink:0; }
  .account-actions .account-kakaopay{ margin:0; padding:8px 10px; }
  .account-actions .account-copy-hint{ justify-content:center; min-height:44px; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:transparent; font-family:'Noto Sans KR',sans-serif; font-size:.72rem; cursor:pointer; }
  .account-info{ min-width:0; overflow-wrap:anywhere; }
  .account-actions .account-copy-hint:focus-visible{ outline:2px solid var(--accent); outline-offset:3px; }
</style>`);
const output = encrypt(next, passphrase, iterations);
if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed.');
fs.writeFileSync(invitationPath, output);
console.log('Moved KakaoPay above the account copy button and expanded its label.');
