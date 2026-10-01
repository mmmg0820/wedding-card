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

const path = require('path');
const passphrase = readAutoUnlockPassphrase();
const { html, iterations } = decrypt(fs.readFileSync(invitationPath), passphrase);
const guideStart = html.indexOf('<section class="section" id="local-guide"');
if (guideStart < 0 || html.includes('id="nav-etc"')) throw new Error('Expected the inline guide without an ETC link.');
const guideEnd = html.indexOf('</section>', guideStart) + '</section>'.length;
if (guideEnd < guideStart) throw new Error('Guide closing tag not found.');
const guide = html.slice(guideStart, guideEnd);
const cssStart = html.indexOf('  .local-guide-eyebrow{');
const cssEnd = html.indexOf('</style>', cssStart);
if (cssStart < 0 || cssEnd < cssStart) throw new Error('Guide styles not found.');
const guideCss = html.slice(cssStart, cssEnd);
let next = replaceOnce(html, guide, '');
next = replaceOnce(next, guideCss, '');
next = replaceOnce(next, '<a href="#map">Location</a>', '<a href="#map">Location</a><a id="nav-etc" href="etc.html" target="_top">ETC</a>');
next = replaceOnce(next, '</body>', `<script>
  // Resolve against the outer page so both localhost and GitHub Pages work.
  document.getElementById('nav-etc').href = new URL('etc.html', window.parent.location.href).href;
</script></body>`);
next = replaceOnce(next, '</style>', `
  /* Six navigation items remain accessible on narrow phones. */
  .nav-inner{ gap:clamp(8px,2.5vw,16px); padding:8px 12px; justify-content:space-between; }
  .nav-inner a{ display:inline-flex; align-items:center; min-height:44px; font-size:clamp(10px,2.6vw,11.2px); letter-spacing:.25px; }
</style>`);

const page = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>ETC · 대전 맛집 안내</title>
  <link rel="icon" href="favicon.ico">
  <style>
    :root{ --bg:#efebe9; --bg-soft:#fff; --text:rgba(0,0,0,.82); --text-muted:rgba(0,0,0,.62); --line:rgba(0,0,0,.12); --accent:#a8434a; --radius:6px; }
    *{ box-sizing:border-box; }
    body{ margin:0; background:var(--bg); color:var(--text); font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif; line-height:1.7; word-break:keep-all; }
    .etc-header{ max-width:480px; margin:auto; padding:20px 24px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); }
    .etc-header h1{ margin:0; font-family:Georgia,serif; font-size:1rem; font-weight:500; letter-spacing:2px; }
    .back-link{ display:inline-flex; align-items:center; min-height:44px; color:var(--text-muted); text-decoration:none; font-size:.8rem; }
    .back-link:focus-visible{ outline:2px solid var(--accent); outline-offset:3px; }
    .section{ max-width:480px; margin:0 auto; padding:44px 24px 64px; }
    .section-title{ margin:0; text-align:center; font-size:1.2rem; font-weight:600; letter-spacing:1px; }
    ${guideCss}
    @media(max-width:360px){ .section{ padding-left:20px; padding-right:20px; } }
  </style>
</head>
<body>
  <header class="etc-header"><a class="back-link" href="./">← 청첩장으로</a><h1>ETC</h1></header>
  <main>${guide}</main>
</body>
</html>
`;
if ((page.match(/<li>/g) || []).length !== 14) throw new Error('Expected 14 places.');
if (next.includes('id="local-guide"')) throw new Error('Inline guide remains.');
const output = encrypt(next, passphrase, iterations);
if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed.');
fs.writeFileSync(path.join(path.dirname(shellPath), 'etc.html'), page);
fs.writeFileSync(invitationPath, output);
console.log('Moved all 14 places to etc.html and added the top-level ETC navigation link.');
