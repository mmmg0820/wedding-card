const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const childProcess = require('child_process');
const { protectInvitation, protectShell } = require('../protect-invitation-photos');

const helperSource = fs.readFileSync('scripts/refine-account-copy-and-navigation.js', 'utf8')
  .split('const passphrase = readAutoUnlockPassphrase();')[0];
const helpers = vm.runInNewContext(helperSource + '\n({ decrypt, readAutoUnlockPassphrase })', { require, process: { argv: [] }, Buffer });
const passphrase = helpers.readAutoUnlockPassphrase();
const current = helpers.decrypt(fs.readFileSync('docs/assets/invitation.enc'), passphrase).html;
const sourceRevision = process.env.PHOTO_PROTECTION_BASE || '54a2b3987ecc90c89f138b668fa7a88363d18cd0';
const original = helpers.decrypt(childProcess.execFileSync('git', ['show', `${sourceRevision}:docs/assets/invitation.enc`], { maxBuffer: 20 * 1024 * 1024 }), passphrase).html;
const originalShell = childProcess.execFileSync('git', ['show', `${sourceRevision}:docs/index.html`], { encoding: 'utf8' });
assert.equal(current, protectInvitation(original), 'Only the exact intended migration changes are present');
assert.equal(fs.readFileSync('docs/index.html', 'utf8'), protectShell(originalShell));
assert.deepEqual(current.match(/data:image\/[^"']+/g), original.match(/data:image\/[^"']+/g), 'All embedded photos are byte-for-byte unchanged');
assert(!/galleryLightbox|gallery-lightbox|확대하기/.test(current));
const currentConfig = current.match(/const CONFIG\s*=\s*({[^]*?});/);
const originalConfig = original.match(/const CONFIG\s*=\s*({[^]*?});/);
assert(currentConfig && originalConfig, 'Invitation configuration exists');
assert.equal(currentConfig[1], originalConfig[1], 'All names, photos, accounts and content configuration are unchanged');
assert.equal(vm.runInNewContext('(' + currentConfig[1] + ')').gallery.length, 18);
assert.throws(() => protectInvitation(current));
assert.throws(() => protectShell(protectShell(originalShell)));
for (const document of [current, fs.readFileSync('docs/index.html', 'utf8')]) {
  for (const match of document.matchAll(/<script([^>]*)>([^]*?)<\/script>/g)) {
    if (!match[2].trim()) continue;
    const args = ['--check'];
    if (match[1].includes('type="module"')) args.push('--input-type=module');
    childProcess.execFileSync(process.execPath, args, { input: match[2] });
  }
}

const listeners = new Map();
class Element {
  constructor(photo) { this.photo = photo; }
  closest() { return this.photo ? this : null; }
}
vm.runInNewContext(fs.readFileSync('docs/assets/photo-protection.js', 'utf8'), {
  Element,
  document: { addEventListener(type, listener, options) { listeners.set(type, { listener, options }); } }
});
function event(type, target, touches) {
  let prevented = false;
  listeners.get(type).listener({ target, touches, preventDefault() { prevented = true; } });
  return prevented;
}
for (const type of ['contextmenu', 'dragstart', 'selectstart', 'copy', 'dblclick']) {
  assert.equal(event(type, new Element(true)), true, `${type} is blocked on photos`);
  assert.equal(event(type, new Element(false)), false, `${type} remains available on ordinary text/forms`);
  assert.equal(event(type, { parentElement: new Element(true) }), true, `${type} handles text nodes inside a photo`);
  assert.equal(event(type, null), false);
}
for (const type of ['touchstart', 'touchmove']) {
  assert.equal(listeners.get(type).options.passive, false);
  assert.equal(event(type, new Element(true), [{}]), false, 'One-finger scrolling remains available');
  assert.equal(event(type, new Element(true), [{}, {}]), true, 'Two-finger gesture is canceled');
  assert.equal(event(type, new Element(false), [{}, {}]), true);
}
for (const type of ['gesturestart', 'gesturechange']) {
  assert.equal(event(type, new Element(false)), true);
}
const css = fs.readFileSync('docs/assets/photo-protection.css', 'utf8');
assert(css.includes('touch-action: pan-x pan-y'));
assert(css.includes('-webkit-touch-callout: none'));
assert(!css.includes('touch-action: none'), 'Do not disable ordinary scrolling');
console.log('PASS: exact encrypted migration, unchanged photos, no lightbox, scoped photo guards, copy preservation, pinch guards, idempotence safety.');
