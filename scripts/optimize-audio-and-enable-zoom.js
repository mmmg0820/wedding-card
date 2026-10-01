const fs = require('fs');
const vm = require('vm');
const helpers = fs.readFileSync('scripts/refine-account-copy-and-navigation.js', 'utf8').split('const passphrase = readAutoUnlockPassphrase();')[0];
const context = { require, process, Buffer };
vm.createContext(context);
vm.runInContext(helpers + String.raw`
const passphrase = readAutoUnlockPassphrase();
const { html, iterations } = decrypt(fs.readFileSync(invitationPath), passphrase);
const originalBytes = fs.statSync(invitationPath).size;
let next = html;
const audio = /<audio id="player" src="data:audio\/mpeg;base64,[^"]+" loop><\/audio>/;
if (audio.test(next)) next = next.replace(audio, '<audio id="player" src="audio/bgm.m4a" preload="none" loop></audio>');
if (!next.includes('src="audio/bgm.m4a" preload="none"')) throw new Error('Audio split incomplete');
next = next.replace(/,?\s*maximum-scale=1(?:\.0)?/g, '').replace(/,?\s*user-scalable=no/g, '');
next = next.replace('touch-action:pan-y;', 'touch-action:pan-y pinch-zoom;');
const start = next.indexOf('function openMapApp(service){');
const end = next.indexOf('function maskAccountNumber', start);
if (start < 0 || end < 0) throw new Error('Map handler not found');
next = next.slice(0, start) + 'function openMapApp(service){\n    window.WeddingMaps.open(service, { name: "BMK웨딩홀", address: "대전 중구 서문로 133", lat: 36.3198898, lng: 127.4051471 });\n  }\n\n  ' + next.slice(end);
next = next.replace(/assets\/map-links\.js\?v=[^"<>]+/g, 'assets/map-links.js?v=20261002-audio-zoom');
const config = '<script src="assets/kakao-navi-config.js" defer></script>';
if (!next.includes(config)) next = next.replace('<script src="assets/map-links.js', config + '<script src="assets/map-links.js');
if (!next.includes('.map-links button:disabled')) next = next.replace('</style>', '.map-links button:disabled{opacity:.45;cursor:default;}\n</style>');
if (next !== html) {
  const output = encrypt(next, passphrase, iterations);
  if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed');
  fs.writeFileSync(invitationPath, output);
}
console.log('Initial invitation bytes:', originalBytes, '->', fs.statSync(invitationPath).size);
`, context);
for (const path of ['docs/index.html', 'docs/etc.html']) {
  const html = fs.readFileSync(path, 'utf8');
  const next = html.replace(/,?\s*maximum-scale=1(?:\.0)?/g, '').replace(/,?\s*user-scalable=no/g, '').replace(/assets\/map-links\.js\?v=[^"<>]+/g, 'assets/map-links.js?v=20261002-audio-zoom');
  if (html !== next) fs.writeFileSync(path, next);
}
