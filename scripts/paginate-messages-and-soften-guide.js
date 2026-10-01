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
let next = html;
const start = next.indexOf('  const q = query(messagesRef');
const end = next.indexOf('  async function deleteMessage', start);
if (start < 0 || end < 0) throw new Error('Message listener was not found.');
next = next.slice(0, start) + "  const MESSAGE_PAGE_SIZE = 5;\n  let messagePage = 0;\n  let messageDocuments = [];\n  const messagePager = document.getElementById('messagePager');\n  const previousMessages = document.getElementById('messagesPrevious');\n  const nextMessages = document.getElementById('messagesNext');\n  const messagePageStatus = document.getElementById('messagePageStatus');\n\n  function renderMessagePage() {\n    const list = document.getElementById('messageList');\n    list.innerHTML = '';\n    const pageCount = Math.ceil(messageDocuments.length / MESSAGE_PAGE_SIZE);\n    messagePage = Math.max(0, Math.min(messagePage, pageCount - 1));\n    messagePager.hidden = pageCount <= 1;\n    previousMessages.disabled = messagePage === 0;\n    nextMessages.disabled = messagePage >= pageCount - 1;\n    messagePageStatus.textContent = pageCount ? `${messagePage + 1} / ${pageCount}` : '';\n    if (!messageDocuments.length) {\n      list.innerHTML = '<p class=\"message-empty\">첫 번째 축하 메시지를 남겨주세요 💐</p>';\n      return;\n    }\n    messageDocuments.slice(messagePage * MESSAGE_PAGE_SIZE, (messagePage + 1) * MESSAGE_PAGE_SIZE).forEach(docSnap => {\n      const data = docSnap.data();\n      const item = document.createElement('div');\n      item.className = 'message-item';\n      item.innerHTML = `<div class=\"message-item-header\"><strong>${escapeHtml(data.name)}</strong><button type=\"button\" class=\"message-delete-btn\" data-id=\"${docSnap.id}\">삭제</button></div><p>${escapeHtml(data.message)}</p>`;\n      item.querySelector('.message-delete-btn').addEventListener('click', () => deleteMessage(docSnap.id));\n      list.appendChild(item);\n    });\n  }\n  function changeMessagePage(offset) {\n    messagePage += offset;\n    renderMessagePage();\n    document.getElementById('messageList').scrollIntoView({ behavior:'smooth', block:'start' });\n  }\n  previousMessages.addEventListener('click', () => changeMessagePage(-1));\n  nextMessages.addEventListener('click', () => changeMessagePage(1));\n  const q = query(messagesRef, orderBy('createdAt', 'desc'));\n  onSnapshot(q, snapshot => {\n    messageDocuments = snapshot.docs;\n    renderMessagePage();\n  }, error => {\n    console.error('메시지 로딩 오류:', error);\n    messagePager.hidden = true;\n    document.getElementById('messageList').innerHTML = '<p class=\"message-empty\">메시지를 불러오지 못했습니다.</p>';\n  });\n\n" + next.slice(end);
next = replaceOnce(next, 'await addDoc(messagesRef, { name, message, passwordHash, createdAt: serverTimestamp() });', 'messagePage = 0;\n      await addDoc(messagesRef, { name, message, passwordHash, createdAt: serverTimestamp() });');
next = replaceOnce(next, '<div id="messageList"><p class="message-empty">메시지를 불러오는 중입니다...</p></div>', '<div id="messageList"><p class="message-empty">메시지를 불러오는 중입니다...</p></div><nav class="message-pager" id="messagePager" aria-label="축하 메시지 페이지" hidden><button type="button" id="messagesPrevious">이전</button><span id="messagePageStatus" aria-live="polite" aria-atomic="true"></span><button type="button" id="messagesNext">다음</button></nav>');
next = replaceOnce(next, '<div class="local-guide-entry"><a', '<div class="local-guide-entry"><p class="local-guide-entry-copy">멀리서 오신 분들께 도움이 되길 바라며 카페와 맛집을 소개드립니다</p><a');
next = replaceOnce(next, 'min-height:56px; padding:16px 20px; border:1px solid var(--accent);', 'min-height:56px; padding:16px 20px; border:1px solid var(--line);');
next = replaceOnce(next, 'border-radius:var(--radius); background:var(--bg-soft); color:var(--accent);', 'border-radius:var(--radius); background:rgba(255,255,255,.25); color:var(--text-muted);');
next = replaceOnce(next, '.local-guide-entry a:hover{ background:var(--accent-surface); }', '.local-guide-entry a:hover{ background:rgba(255,255,255,.45); }');
next = replaceOnce(next, '</style>', `
  .local-guide-entry-copy{ margin:0 0 16px; text-align:center; color:var(--text-muted); font-size:.78rem; line-height:1.9; }
  .message-pager{ display:flex; justify-content:center; align-items:center; gap:18px; margin-top:20px; font-size:.8rem; color:var(--text-muted); }
  .message-pager[hidden]{ display:none; }
  .message-pager button{ min-height:44px; min-width:64px; padding:8px 14px; border:1px solid var(--line); border-radius:8px; background:var(--bg-soft); color:var(--text); font:inherit; cursor:pointer; }
  .message-pager button:disabled{ opacity:.4; cursor:default; }
  .message-pager button:focus-visible{ outline:2px solid var(--accent); outline-offset:3px; }
</style>`);
const output = encrypt(next, passphrase, iterations);
if (decrypt(output, passphrase).html !== next) throw new Error('Encryption round trip failed.');
fs.writeFileSync(invitationPath, output);
console.log('Added five-message pagination and a muted local guide button with introduction.');
