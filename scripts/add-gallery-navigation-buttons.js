const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');

const invitationPath = process.argv[2] || 'docs/assets/invitation.enc';
const passphrase = process.env.INVITATION_PASSPHRASE;
if (!passphrase) throw new Error('INVITATION_PASSPHRASE is required');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected once, found ${count}`);
  return source.replace(before, after);
}

const encrypted = fs.readFileSync(invitationPath);
const iterations = encrypted.readUInt32BE(8);
const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), encrypted.subarray(12, 28), iterations, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(28, 40));
decipher.setAAD(Buffer.from('wedding-card-v1'));
decipher.setAuthTag(encrypted.subarray(40, 56));
let html = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(56)), decipher.final()])).toString('utf8');

const oldMarkup = `<div class="gallery-lightbox" id="gallery-lightbox" role="dialog" aria-modal="true" aria-label="확대된 갤러리 사진" aria-hidden="true"><button class="gallery-lightbox-close" id="gallery-lightbox-close" type="button" aria-label="확대 사진 닫기">&times;</button><img id="gallery-lightbox-image" alt=""></div>`;
const newMarkup = `<div class="gallery-lightbox" id="gallery-lightbox" role="dialog" aria-modal="true" aria-label="확대된 갤러리 사진" aria-hidden="true"><button class="gallery-lightbox-close" id="gallery-lightbox-close" type="button" aria-label="확대 사진 닫기">&times;</button><button class="gallery-lightbox-nav gallery-lightbox-prev" id="gallery-lightbox-prev" type="button" aria-label="이전 사진 보기">&#8249;</button><img id="gallery-lightbox-image" alt=""><button class="gallery-lightbox-nav gallery-lightbox-next" id="gallery-lightbox-next" type="button" aria-label="다음 사진 보기">&#8250;</button></div>`;
html = replaceOnce(html, oldMarkup, newMarkup, 'lightbox navigation markup');

const buttonCss = `

  /* ---------- gallery previous and next buttons ---------- */
  .gallery-lightbox-nav{
    position:absolute;
    top:50%;
    z-index:2;
    width:42px;
    height:52px;
    display:grid;
    place-items:center;
    padding:0 0 4px;
    border:0;
    border-radius:999px;
    background:rgba(255,255,255,.82);
    color:#292826;
    font-size:34px;
    line-height:1;
    transform:translateY(-50%);
    cursor:pointer;
    -webkit-tap-highlight-color:transparent;
  }
  .gallery-lightbox-prev{ left:10px; }
  .gallery-lightbox-next{ right:10px; }
  .gallery-lightbox-nav:active{ background:#fff; }
`;
html = replaceOnce(html, '</style></head>', `${buttonCss}</style></head>`, 'style closing tag');

html = replaceOnce(
  html,
  `    const galleryLightboxClose = document.getElementById("gallery-lightbox-close");`,
  `    const galleryLightboxClose = document.getElementById("gallery-lightbox-close");
    const galleryLightboxPrev = document.getElementById("gallery-lightbox-prev");
    const galleryLightboxNext = document.getElementById("gallery-lightbox-next");`,
  'lightbox navigation elements',
);

html = replaceOnce(
  html,
  `    galleryLightboxImage.addEventListener("dblclick", closeGalleryLightbox);`,
  `    galleryLightboxPrev.addEventListener("click", () => showGalleryPhoto(galleryLightboxIndex - 1, -1));
    galleryLightboxNext.addEventListener("click", () => showGalleryPhoto(galleryLightboxIndex + 1, 1));
    galleryLightboxImage.addEventListener("dblclick", closeGalleryLightbox);`,
  'lightbox navigation events',
);

for (const marker of ['id="gallery-lightbox-prev"', 'id="gallery-lightbox-next"', '이전 사진 보기', '다음 사진 보기', 'galleryLightboxIndex - 1', 'galleryLightboxIndex + 1']) {
  if (!html.includes(marker)) throw new Error(`gallery navigation marker missing: ${marker}`);
}
for (const existingFeature of ['galleryLightboxClose.addEventListener', 'addEventListener("dblclick"', 'addEventListener("touchend"', 'max-width:80vw']) {
  if (!html.includes(existingFeature)) throw new Error(`existing lightbox feature missing: ${existingFeature}`);
}

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const outputKey = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), salt, iterations, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', outputKey, iv);
cipher.setAAD(Buffer.from('wedding-card-v1'));
const ciphertext = Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(html))), cipher.final()]);
const header = Buffer.alloc(12);
header.write('WEDLOCK1');
header.writeUInt32BE(iterations, 8);
fs.writeFileSync(invitationPath, Buffer.concat([header, salt, iv, cipher.getAuthTag(), ciphertext]));

console.log('Added previous and next buttons to the gallery lightbox.');
