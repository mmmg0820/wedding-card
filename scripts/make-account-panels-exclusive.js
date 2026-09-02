const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');

const invitationPath = process.argv[2] || 'docs/assets/invitation.enc';
const passphrase = process.env.INVITATION_PASSPHRASE;
if (!passphrase) throw new Error('INVITATION_PASSPHRASE is required');

const encrypted = fs.readFileSync(invitationPath);
const iterations = encrypted.readUInt32BE(8);
const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), encrypted.subarray(12, 28), iterations, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(28, 40));
decipher.setAAD(Buffer.from('wedding-card-v1'));
decipher.setAuthTag(encrypted.subarray(40, 56));
let html = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(56)), decipher.final()])).toString('utf8');

const before = `  function toggleAccount(side){
    const panel = document.getElementById(\`panel-\${side}\`);
    const btn = document.getElementById(\`btn-\${side}\`);
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    btn.classList.toggle('active', !isOpen);
  }`;
const after = `  function toggleAccount(side){
    const panel = document.getElementById(\`panel-\${side}\`);
    const btn = document.getElementById(\`btn-\${side}\`);
    const isOpen = panel.classList.contains('open');

    ['groom', 'bride'].forEach(otherSide => {
      document.getElementById(\`panel-\${otherSide}\`).classList.remove('open');
      document.getElementById(\`btn-\${otherSide}\`).classList.remove('active');
    });

    if (!isOpen){
      panel.classList.add('open');
      btn.classList.add('active');
    }
  }`;

const count = html.split(before).length - 1;
if (count !== 1) throw new Error(`toggleAccount: expected once, found ${count}`);
html = html.replace(before, after);

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
console.log('Made groom and bride account panels mutually exclusive.');
