const fs = require('fs');
const vm = require('vm');
const helpers = fs.readFileSync('scripts/refine-account-copy-and-navigation.js', 'utf8').split('const passphrase = readAutoUnlockPassphrase();')[0];
const context = { require, process, Buffer };
vm.createContext(context);
vm.runInContext(helpers + String.raw`
const passphrase = readAutoUnlockPassphrase();
const { html, iterations } = decrypt(fs.readFileSync(invitationPath), passphrase);
let next = html;
const loader = '<script src="assets/map-links.js?v=20261002" defer></script>';
if (!next.includes(loader)) next = replaceOnce(next, '</head>', loader + '</head>');
const before = 'function openMapApp(service){';
const after = before + '\n    if (["naver", "kakaomap", "google"].includes(service)) {\n      window.WeddingMaps.open(service, { name: "BMK웨딩홀", address: "대전 중구 서문로 133", lat: 36.3198898, lng: 127.4051471 });\n      return;\n    }';
if (!next.includes('window.WeddingMaps.open')) next = replaceOnce(next, before, after);
if (next !== html) {
  const output = encrypt(next, passphrase, iterations);
  if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed');
  fs.writeFileSync(invitationPath, output);
}
`, context);
const guidePath = 'docs/etc.html';
let guide = fs.readFileSync(guidePath, 'utf8');
const loader = '<script src="assets/map-links.js?v=20261002" defer></script>';
if (!guide.includes(loader)) {
  guide = guide.replace('</head>', loader + '</head>');
  fs.writeFileSync(guidePath, guide);
}
console.log('Enabled direct place app links in invitation and guide.');
