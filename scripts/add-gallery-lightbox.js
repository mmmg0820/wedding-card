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

const lightboxCss = `

  /* ---------- gallery photo lightbox ---------- */
  .gallery-item{ cursor:zoom-in; }
  .gallery-item img:focus-visible{ outline:2px solid var(--accent); outline-offset:3px; }
  body.gallery-lightbox-open{ overflow:hidden; }
  .gallery-lightbox{
    position:fixed;
    inset:0;
    z-index:1000;
    display:none;
    align-items:center;
    justify-content:center;
    padding:20px 12px;
    background:rgba(20,20,20,.9);
    backdrop-filter:blur(5px);
  }
  .gallery-lightbox.is-open{ display:flex; }
  .gallery-lightbox img{
    display:block;
    max-width:100%;
    max-height:calc(100vh - 40px);
    max-height:calc(100dvh - 40px);
    object-fit:contain;
    border-radius:8px;
    box-shadow:0 16px 50px rgba(0,0,0,.35);
  }
  .gallery-lightbox-close{
    position:absolute;
    top:max(12px, env(safe-area-inset-top));
    right:12px;
    width:42px;
    height:42px;
    display:grid;
    place-items:center;
    padding:0;
    border:0;
    border-radius:50%;
    background:rgba(255,255,255,.92);
    color:#292826;
    font-size:25px;
    line-height:1;
    cursor:pointer;
  }
`;
html = replaceOnce(html, '</style></head>', `${lightboxCss}</style></head>`, 'style closing tag');

const lightboxMarkup = `<div class="gallery-lightbox" id="gallery-lightbox" role="dialog" aria-modal="true" aria-label="확대된 갤러리 사진" aria-hidden="true"><button class="gallery-lightbox-close" id="gallery-lightbox-close" type="button" aria-label="확대 사진 닫기">&times;</button><img id="gallery-lightbox-image" alt=""></div>`;
html = replaceOnce(html, '</body>', `${lightboxMarkup}</body>`, 'body closing tag');

const gallerySetupBefore = `    const galleryContainer = document.getElementById("gallery-container");`;
const gallerySetupAfter = `    const galleryContainer = document.getElementById("gallery-container");
    const galleryLightbox = document.getElementById("gallery-lightbox");
    const galleryLightboxImage = document.getElementById("gallery-lightbox-image");
    const galleryLightboxClose = document.getElementById("gallery-lightbox-close");
    let galleryLightboxTrigger = null;
    const openGalleryLightbox = (src, alt, trigger) => {
      galleryLightboxTrigger = trigger;
      galleryLightboxImage.src = src;
      galleryLightboxImage.alt = alt;
      galleryLightbox.classList.add("is-open");
      galleryLightbox.setAttribute("aria-hidden", "false");
      document.body.classList.add("gallery-lightbox-open");
      galleryLightboxClose.focus({ preventScroll:true });
    };
    const closeGalleryLightbox = () => {
      if (!galleryLightbox.classList.contains("is-open")) return;
      galleryLightbox.classList.remove("is-open");
      galleryLightbox.setAttribute("aria-hidden", "true");
      document.body.classList.remove("gallery-lightbox-open");
      galleryLightboxImage.removeAttribute("src");
      galleryLightboxTrigger?.focus({ preventScroll:true });
      galleryLightboxTrigger = null;
    };
    galleryLightboxClose.addEventListener("click", closeGalleryLightbox);
    galleryLightbox.addEventListener("click", event => {
      if (event.target === galleryLightbox) closeGalleryLightbox();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeGalleryLightbox();
    });`;
html = replaceOnce(html, gallerySetupBefore, gallerySetupAfter, 'gallery lightbox setup');

const imageSetupBefore = `        image.draggable = false;
        image.addEventListener("error", () => item.remove());`;
const imageSetupAfter = `        image.draggable = false;
        image.tabIndex = 0;
        image.setAttribute("role", "button");
        image.setAttribute("aria-label", \`갤러리 사진 \${idx + 1} 확대하기\`);
        image.addEventListener("click", () => openGalleryLightbox(src, image.alt, image));
        image.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openGalleryLightbox(src, image.alt, image);
          }
        });
        image.addEventListener("error", () => item.remove());`;
html = replaceOnce(html, imageSetupBefore, imageSetupAfter, 'gallery image interaction');

if (!html.includes('id="gallery-lightbox"') || !html.includes('openGalleryLightbox(src, image.alt, image)')) {
  throw new Error('gallery lightbox was not installed correctly');
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

console.log('Added accessible tap-to-expand behavior to gallery photos.');
