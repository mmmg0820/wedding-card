const fs = require('fs');
const vm = require('vm');

const assetTags = '<link rel="stylesheet" href="assets/photo-protection.css?v=20261024"><script src="assets/photo-protection.js?v=20261024" defer></script>';
const viewport = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

function replaceOnce(source, before, after, label) {
  if (source.split(before).length !== 2) throw new Error(`${label}: expected exactly one target`);
  return source.replace(before, after);
}

function removeBetween(source, start, end, label) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0 || source.indexOf(start, from + start.length) >= 0) {
    throw new Error(`${label}: missing or ambiguous block`);
  }
  return source.slice(0, from) + source.slice(to);
}

function addProtections(source) {
  if (source.includes('assets/photo-protection.')) throw new Error('Photo protections are already installed');
  const matches = source.match(/<meta name="viewport" content="[^"]*">/g) || [];
  if (matches.length !== 1) throw new Error('Expected exactly one viewport meta tag');
  source = source.replace(matches[0], `<meta name="viewport" content="${viewport}">`);
  return replaceOnce(source, '</head><body', assetTags + '</head><body', 'document head closing tag');
}

function protectInvitation(html) {
  let next = removeBetween(html,
    '  /* ---------- gallery photo lightbox ---------- */',
    '  /* ---------- three-column gallery thumbnails ---------- */', 'lightbox styles');
  next = removeBetween(next,
    '  /* ---------- lightbox gestures ---------- */',
    '  /* ---------- repeatable mobile section navigation ---------- */', 'lightbox gestures');
  next = removeBetween(next,
    '  /* ---------- gallery previous and next buttons ---------- */',
    '  /* Keep the external map visible independently', 'lightbox button styles');
  next = removeBetween(next,
    '    const galleryLightbox = document.getElementById("gallery-lightbox");',
    '    if (galleryEnabled) {', 'lightbox handlers');
  next = removeBetween(next,
    '        image.tabIndex = 0;',
    '        image.addEventListener("error", () => item.remove());', 'photo activation');
  const dialogs = next.match(/<div class="gallery-lightbox"[^]*?<\/div>/g) || [];
  if (dialogs.length !== 1) throw new Error('Expected one lightbox dialog');
  next = replaceOnce(next, dialogs[0], '', 'lightbox dialog');
  next = replaceOnce(next,
    "  document.addEventListener('contextmenu', (event) => event.preventDefault());\n  document.addEventListener('dragstart', (event) => {\n    if (event.target instanceof HTMLImageElement) event.preventDefault();\n  });",
    '', 'old document-wide context-menu guard');
  next = addProtections(next);
  if (/galleryLightbox|gallery-lightbox|openGalleryLightbox|확대하기|cursor:zoom-in/.test(next)) {
    throw new Error('A lightbox activation or accessibility label remains');
  }
  return next;
}

function protectShell(html) {
  return addProtections(replaceOnce(html,
    'd.addEventListener("contextmenu",o=>o.preventDefault());d.addEventListener("dragstart",o=>o.preventDefault())',
    '', 'old shell context-menu guard'));
}

function main() {
  // Reuse the repository's existing authenticated payload format and auto-unlock helper.
  const helperSource = fs.readFileSync('scripts/refine-account-copy-and-navigation.js', 'utf8')
    .split('const passphrase = readAutoUnlockPassphrase();')[0];
  const { decrypt, encrypt, readAutoUnlockPassphrase } = vm.runInNewContext(
    helperSource + '\n({ decrypt, encrypt, readAutoUnlockPassphrase })', { require, process, Buffer });
  const path = process.argv[2] || 'docs/assets/invitation.enc';
  const shellPath = process.argv[3] || 'docs/index.html';
  const passphrase = readAutoUnlockPassphrase();
  const { html, iterations } = decrypt(fs.readFileSync(path), passphrase);
  const next = protectInvitation(html);
  const shell = protectShell(fs.readFileSync(shellPath, 'utf8'));
  const output = encrypt(next, passphrase, iterations);
  if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed');
  // Prepare and validate both results before writing either file.
  fs.writeFileSync(path, output);
  fs.writeFileSync(shellPath, shell);
  console.log('Removed gallery enlargement and added best-effort photo/zoom guards.');
}

module.exports = { protectInvitation, protectShell, addProtections };
if (require.main === module) main();
