const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { execFileSync } = require('child_process');
const helper = fs.readFileSync('scripts/refine-account-copy-and-navigation.js', 'utf8').split('const passphrase = readAutoUnlockPassphrase();')[0];
const context = { require, process, Buffer };
vm.createContext(context);
vm.runInContext(helper + `globalThis.payload=decrypt(fs.readFileSync(invitationPath),readAutoUnlockPassphrase());globalThis.writePayload=function(html){const output=encrypt(html,readAutoUnlockPassphrase(),payload.iterations);if(decrypt(output,readAutoUnlockPassphrase()).html!==html)throw new Error('Encryption round trip failed');fs.writeFileSync(invitationPath,output);};`, context);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wedding-photo-compression-'));
try {
  const source = path.join(temporary, 'source.html');
  const destination = path.join(temporary, 'compressed.html');
  const report = path.join(temporary, 'report.json');
  fs.writeFileSync(source, context.payload.html, { mode: 0o600 });
  process.stdout.write(execFileSync(process.env.WEDDING_IMAGE_PYTHON || 'python3', ['scripts/compress-photo-assets.py', source, destination, report], { encoding: 'utf8' }));
  const html = fs.readFileSync(destination, 'utf8');
  if (html !== context.payload.html) context.writePayload(html);
  fs.copyFileSync(report, 'scripts/data/photo-compression-report.json');
  console.log('Invitation bytes:', fs.statSync('docs/assets/invitation.enc').size);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
