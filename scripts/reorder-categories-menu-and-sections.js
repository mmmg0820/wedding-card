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
const categories = [
  ['STORY', 'couple'], ['DAY', 'events'], ['LOCATION', 'map'], ['BUS', 'charter-bus'],
  ['PHOTO', 'gallery'], ['MESSAGE', 'comment'], ['ACCOUNT', 'account']
];
const nav = '<div class="nav-bar"><div class="nav-inner">' + categories.map(([label, id]) => `<a${id === 'gallery' ? ' id="nav-gallery"' : ''} href="#${id}">${label}</a>`).join('') + '</div></div>';
const oldNav = html.match(/<div class="nav-bar"><div class="nav-inner">[\s\S]*?<\/div><\/div>/);
if (!oldNav) throw new Error('Navigation was not found.');
let next = replaceOnce(html, oldNav[0], nav);
const sections = new Map([...next.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)].map(match => [match[0].match(/id="([^"]+)"/)[1], match[0]]));
const guide = next.match(/<div class="local-guide-entry">[\s\S]*?<\/a><\/div>/);
if (!guide || sections.size !== 8) throw new Error('Unexpected section structure.');
const regionStart = next.indexOf(sections.get('couple'));
const regionEnd = next.indexOf(guide[0]) + guide[0].length;
const ordered = categories.map(([, id]) => {
  if (!sections.has(id)) throw new Error(`Missing section: ${id}`);
  return sections.get(id);
}).join('') + guide[0];
next = next.slice(0, regionStart) + ordered + next.slice(regionEnd);
next = replaceOnce(next, "  document.querySelectorAll('.nav-inner a').forEach(original=>{", `  const homeLink=document.createElement('a'); homeLink.href='#home'; homeLink.textContent='HOME'; links.appendChild(homeLink);
  document.querySelectorAll('.nav-inner a').forEach(original=>{`);
next = replaceOnce(next, "    const link=original.cloneNode(true); link.removeAttribute('id'); links.appendChild(link);\n  });", `    const link=original.cloneNode(true); link.removeAttribute('id'); links.appendChild(link);
  });
  const etcLink=document.createElement('a'); etcLink.href=new URL('etc.html',window.parent.location.href).href; etcLink.target='_top'; etcLink.textContent='ETC'; links.appendChild(etcLink);`);
next = replaceOnce(next, "    const target=document.getElementById(link.getAttribute('href').slice(1));if(!target)return;", "    const href=link.getAttribute('href'); if(!href.startsWith('#')){dialog.close();return;}\n    const target=document.getElementById(href.slice(1));if(!target)return;");
const output=encrypt(next,passphrase,iterations);
if(decrypt(output,passphrase).html!==next)throw new Error('Encryption round trip failed.');
fs.writeFileSync(invitationPath,output);
console.log('Updated categories, expanded menu and section order.');
