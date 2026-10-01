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
let next = replaceOnce(html, '</style>', `
  .nav-bar{ display:none; }
  #audio-toggle{ bottom:72px; }
  #menu-toggle{ left:20px; bottom:20px; font-size:11px; font-weight:600; }
  .menu-dialog{ width:min(360px,calc(100% - 40px)); max-height:calc(100dvh - 48px); overflow:auto; padding:28px; border:1px solid var(--line); border-radius:20px; background:var(--bg); color:var(--text); }
  .menu-dialog::backdrop{ background:rgba(35,25,25,.28); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
  .menu-dialog h2{ margin:0 0 20px; text-align:center; font-size:1rem; }
  .menu-close{ position:absolute; right:12px; top:8px; min-width:44px; min-height:44px; border:0; background:transparent; font-size:24px; cursor:pointer; }
  .menu-links{ display:grid; gap:8px; }
  .menu-links a{ display:flex; align-items:center; justify-content:center; min-height:48px; padding:10px; border:1px solid var(--line); border-radius:10px; text-decoration:none; font-size:.85rem; }
  .menu-links a:hover{ background:var(--bg-soft); }
  .menu-dialog :focus-visible,#menu-toggle:focus-visible{ outline:2px solid var(--accent); outline-offset:3px; }
</style>`);
next = replaceOnce(next, '</body>', `<button type="button" class="float-btn" id="menu-toggle" aria-haspopup="dialog" aria-controls="section-menu" aria-expanded="false">메뉴</button>
<dialog class="menu-dialog" id="section-menu" aria-labelledby="menu-title"><button class="menu-close" type="button" aria-label="메뉴 닫기">×</button><h2 id="menu-title">MENU</h2><nav class="menu-links" aria-label="청첩장 메뉴"></nav></dialog>
<script>
document.addEventListener('DOMContentLoaded',()=>{
  const button=document.getElementById('menu-toggle');
  const dialog=document.getElementById('section-menu');
  const links=dialog.querySelector('.menu-links');
  document.querySelectorAll('.nav-inner a').forEach(original=>{
    if(original.hidden)return;
    const link=original.cloneNode(true); link.removeAttribute('id'); links.appendChild(link);
  });
  let savedOverflow='';
  button.addEventListener('click',()=>{ savedOverflow=document.body.style.overflow; dialog.showModal(); document.body.style.overflow='hidden'; button.setAttribute('aria-expanded','true'); });
  dialog.querySelector('.menu-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{ if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();} });
  dialog.addEventListener('close',()=>{document.body.style.overflow=savedOverflow;button.setAttribute('aria-expanded','false');button.focus({preventScroll:true});});
  links.addEventListener('click',event=>{
    const link=event.target.closest('a'); if(!link)return;
    const target=document.getElementById(link.getAttribute('href').slice(1));if(!target)return;
    event.preventDefault();dialog.close(); requestAnimationFrame(()=>target.scrollIntoView({behavior:'smooth',block:'start'}));
  });
});
</script></body>`);
const output=encrypt(next,passphrase,iterations);
if(decrypt(output,passphrase).html!==next)throw new Error('Encryption round trip failed');
fs.writeFileSync(invitationPath,output);
console.log('Added floating menu below audio with blurred modal navigation.');
