const fs = require('fs');
const vm = require('vm');
const helpers = fs.readFileSync('scripts/refine-account-copy-and-navigation.js', 'utf8').split('const passphrase = readAutoUnlockPassphrase();')[0];
const context = { require, process, Buffer };
vm.createContext(context);
vm.runInContext(helpers + String.raw`
const passphrase = readAutoUnlockPassphrase();
const { html, iterations } = decrypt(fs.readFileSync(invitationPath), passphrase);
let next = html;
const before = '["naver", "kakaomap", "google"].includes(service)';
const after = '["naver", "kakaomap", "google", "tmap"].includes(service)';
if (next.includes(before)) next = replaceOnce(next, before, after);
const obsolete = 'web: \x60https://www.tmap.co.kr/search?searchKeyword=$' + '{query}\x60';
if (next.includes(obsolete)) next = replaceOnce(next, obsolete, 'web: "https://play.google.com/store/apps/details?id=com.skt.tmap.ku"');
next = next.replace('details?id=com.skt.tmap"', 'details?id=com.skt.tmap.ku"');
next = next.replace('assets/map-links.js?v=20261002"', 'assets/map-links.js?v=20261002-tmap"');
if (!next.includes(after) || next.includes('www.tmap.co.kr/search')) throw new Error('TMAP patch incomplete');
if (next !== html) {
  const output = encrypt(next, passphrase, iterations);
  if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed');
  fs.writeFileSync(invitationPath, output);
}
`, context);
const guidePath = 'docs/etc.html';
const guide = fs.readFileSync(guidePath, 'utf8');
fs.writeFileSync(guidePath, guide.replace('assets/map-links.js?v=20261002"', 'assets/map-links.js?v=20261002-tmap"'));
console.log('Fixed TMAP button to open venue route in the app, with store fallback.');
