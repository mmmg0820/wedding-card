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

const refinementCss = `

  /* ---------- lightbox gestures ---------- */
  @keyframes lightboxFadeIn{
    from{ opacity:0; }
    to{ opacity:1; }
  }
  @keyframes lightboxPhotoIn{
    from{ opacity:0; transform:scale(.975); }
    to{ opacity:1; transform:scale(1); }
  }
  @keyframes lightboxPhotoChange{
    from{ opacity:.3; transform:translateX(var(--gallery-swipe-shift, 12px)) scale(.985); }
    to{ opacity:1; transform:translateX(0) scale(1); }
  }
  .gallery-lightbox.is-open{ animation:lightboxFadeIn .18s ease-out; }
  .gallery-lightbox.is-open > img{ animation:lightboxPhotoIn .24s ease-out; }
  .gallery-lightbox > img{
    touch-action:pan-y;
    user-select:none;
    -webkit-user-drag:none;
  }
  .gallery-lightbox > img.is-changing{ animation:lightboxPhotoChange .2s ease-out; }
  @media (prefers-reduced-motion:reduce){
    .gallery-lightbox.is-open,
    .gallery-lightbox.is-open > img,
    .gallery-lightbox > img.is-changing{ animation:none!important; }
  }
`;
html = replaceOnce(html, '</style></head>', `${refinementCss}</style></head>`, 'style closing tag');

const stateBefore = `    let galleryLightboxTrigger = null;
    const openGalleryLightbox = (src, alt, trigger) => {
      galleryLightboxTrigger = trigger;
      galleryLightboxImage.src = src;
      galleryLightboxImage.alt = alt;`;
const stateAfter = `    let galleryLightboxTrigger = null;
    let galleryLightboxIndex = 0;
    let galleryTouchStartX = null;
    const showGalleryPhoto = (index, direction = 1) => {
      galleryLightboxIndex = (index + CONFIG.gallery.length) % CONFIG.gallery.length;
      galleryLightboxImage.src = CONFIG.gallery[galleryLightboxIndex];
      galleryLightboxImage.alt = \`Gallery Photo \${galleryLightboxIndex + 1}\`;
      galleryLightboxImage.style.setProperty("--gallery-swipe-shift", direction < 0 ? "-12px" : "12px");
      galleryLightboxImage.classList.remove("is-changing");
      void galleryLightboxImage.offsetWidth;
      galleryLightboxImage.classList.add("is-changing");
    };
    const openGalleryLightbox = (index, trigger) => {
      galleryLightboxTrigger = trigger;
      showGalleryPhoto(index);`;
html = replaceOnce(html, stateBefore, stateAfter, 'lightbox state and photo navigation');

const closeHandlersBefore = `    galleryLightboxClose.addEventListener("click", closeGalleryLightbox);
    galleryLightbox.addEventListener("click", event => {
      if (event.target === galleryLightbox) closeGalleryLightbox();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeGalleryLightbox();
    });`;
const closeHandlersAfter = `    galleryLightboxClose.addEventListener("click", closeGalleryLightbox);
    galleryLightbox.addEventListener("click", event => {
      if (event.target === galleryLightbox) closeGalleryLightbox();
    });
    galleryLightboxImage.addEventListener("dblclick", closeGalleryLightbox);
    galleryLightboxImage.addEventListener("touchstart", event => {
      galleryTouchStartX = event.changedTouches[0]?.clientX ?? null;
    }, { passive:true });
    galleryLightboxImage.addEventListener("touchend", event => {
      if (galleryTouchStartX === null) return;
      const touchEndX = event.changedTouches[0]?.clientX ?? galleryTouchStartX;
      const distance = touchEndX - galleryTouchStartX;
      galleryTouchStartX = null;
      if (Math.abs(distance) < 45) return;
      showGalleryPhoto(galleryLightboxIndex + (distance < 0 ? 1 : -1), distance < 0 ? 1 : -1);
    }, { passive:true });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeGalleryLightbox();
      if (!galleryLightbox.classList.contains("is-open")) return;
      if (event.key === "ArrowLeft") showGalleryPhoto(galleryLightboxIndex - 1, -1);
      if (event.key === "ArrowRight") showGalleryPhoto(galleryLightboxIndex + 1, 1);
    });`;
html = replaceOnce(html, closeHandlersBefore, closeHandlersAfter, 'lightbox close and swipe handlers');

html = replaceOnce(
  html,
  'image.addEventListener("click", () => openGalleryLightbox(src, image.alt, image));',
  'image.addEventListener("click", () => openGalleryLightbox(idx, image));',
  'gallery image click handler',
);
html = replaceOnce(
  html,
  'openGalleryLightbox(src, image.alt, image);',
  'openGalleryLightbox(idx, image);',
  'gallery image keyboard handler',
);

for (const marker of ['addEventListener("dblclick"', 'addEventListener("touchend"', 'showGalleryPhoto(galleryLightboxIndex +']) {
  if (!html.includes(marker)) throw new Error(`lightbox/countdown refinement missing: ${marker}`);
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

console.log('Compacted the countdown and added animated swipe and double-click lightbox controls.');
