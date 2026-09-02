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

const animationCss = `

  /* ---------- Motion inspired by the Dubai reference ---------- */
  html{ scroll-behavior:smooth; }
  body{ overflow-x:hidden; }

  @keyframes heroKenBurns{
    from{ background-size:auto 112%; }
    to{ background-size:auto 102%; }
  }
  @keyframes heroRise{
    from{ opacity:0; transform:translate3d(0,24px,0); filter:blur(5px); }
    to{ opacity:1; transform:translate3d(0,0,0); filter:blur(0); }
  }
  @keyframes navDrop{
    from{ opacity:0; transform:translate3d(0,-10px,0); }
    to{ opacity:1; transform:translate3d(0,0,0); }
  }
  @keyframes dayBloom{
    from{ opacity:0; transform:scale(.72); }
    to{ opacity:1; transform:scale(1); }
  }

  .motion-ready .hero{
    background-position:center calc(50% + var(--hero-shift, 0px));
    animation:heroKenBurns 10s cubic-bezier(.2,.7,.2,1) both;
  }
  .motion-ready .hero-sub,
  .motion-ready .hero-names,
  .motion-ready .hero-date,
  .motion-ready .hero-watermark{
    opacity:0;
    animation:heroRise .9s cubic-bezier(.22,1,.36,1) forwards;
  }
  .motion-ready .hero-sub{ animation-delay:.12s; }
  .motion-ready .hero-names{ animation-delay:.32s; }
  .motion-ready .hero-date{ animation-delay:.54s; }
  .motion-ready .hero-watermark{ animation-delay:.82s; }

  .motion-ready .nav-inner a{
    opacity:0;
    animation:navDrop .6s cubic-bezier(.22,1,.36,1) forwards;
  }
  .motion-ready .nav-inner a:nth-child(1){ animation-delay:.1s; }
  .motion-ready .nav-inner a:nth-child(2){ animation-delay:.16s; }
  .motion-ready .nav-inner a:nth-child(3){ animation-delay:.22s; }
  .motion-ready .nav-inner a:nth-child(4){ animation-delay:.28s; }
  .motion-ready .nav-inner a:nth-child(5){ animation-delay:.34s; }

  .motion-ready .section > *{
    opacity:0;
    transform:translate3d(0,34px,0);
    filter:blur(3px);
    transition:
      opacity .85s cubic-bezier(.22,1,.36,1),
      transform .85s cubic-bezier(.22,1,.36,1),
      filter .7s ease;
    will-change:opacity,transform;
  }
  .motion-ready .section.is-visible > *{
    opacity:1;
    transform:translate3d(0,0,0);
    filter:blur(0);
  }
  .motion-ready .section > *:nth-child(2){ transition-delay:.1s; }
  .motion-ready .section > *:nth-child(3){ transition-delay:.2s; }
  .motion-ready .section > *:nth-child(4){ transition-delay:.3s; }
  .motion-ready .section > *:nth-child(5){ transition-delay:.4s; }
  .motion-ready .section > *:nth-child(n+6){ transition-delay:.5s; }

  .motion-ready .section-title{
    letter-spacing:5px;
    transition-property:opacity,transform,filter,letter-spacing;
  }
  .motion-ready .section.is-visible .section-title{ letter-spacing:1px; }

  .motion-ready .photo-watermarked,
  .motion-ready .gallery-wrap,
  .motion-ready .map-frame{
    clip-path:inset(0 0 100% 0 round var(--radius));
    transform:translate3d(0,20px,0) scale(.985);
    transition-property:opacity,transform,filter,clip-path;
    transition-duration:1s;
  }
  .motion-ready .section.is-visible .photo-watermarked,
  .motion-ready .section.is-visible .gallery-wrap,
  .motion-ready .section.is-visible .map-frame{
    clip-path:inset(0 0 0 0 round var(--radius));
    transform:translate3d(0,0,0) scale(1);
  }

  .motion-ready .calendar-grid span{ opacity:0; transform:scale(.72); }
  .motion-ready .section.is-visible .calendar-grid span{
    animation:dayBloom .38s cubic-bezier(.22,1,.36,1) forwards;
  }
  .motion-ready .section.is-visible .calendar-grid span:nth-of-type(7n+1){ animation-delay:.08s; }
  .motion-ready .section.is-visible .calendar-grid span:nth-of-type(7n+2){ animation-delay:.12s; }
  .motion-ready .section.is-visible .calendar-grid span:nth-of-type(7n+3){ animation-delay:.16s; }
  .motion-ready .section.is-visible .calendar-grid span:nth-of-type(7n+4){ animation-delay:.2s; }
  .motion-ready .section.is-visible .calendar-grid span:nth-of-type(7n+5){ animation-delay:.24s; }
  .motion-ready .section.is-visible .calendar-grid span:nth-of-type(7n+6){ animation-delay:.28s; }
  .motion-ready .section.is-visible .calendar-grid span:nth-of-type(7n){ animation-delay:.32s; }

  .motion-ready .map-links button,
  .motion-ready .account-toggle-btn,
  .motion-ready .share-button{
    transition:transform .25s ease, box-shadow .25s ease, border-color .25s ease;
  }
  .motion-ready .map-links button:active,
  .motion-ready .account-toggle-btn:active,
  .motion-ready .share-button:active{ transform:scale(.95); }

  @media (prefers-reduced-motion:reduce){
    html{ scroll-behavior:auto; }
    .motion-ready .hero,
    .motion-ready .hero-sub,
    .motion-ready .hero-names,
    .motion-ready .hero-date,
    .motion-ready .hero-watermark,
    .motion-ready .nav-inner a,
    .motion-ready .section > *,
    .motion-ready .calendar-grid span{
      animation:none!important;
      transition:none!important;
      opacity:1!important;
      transform:none!important;
      filter:none!important;
      clip-path:none!important;
      letter-spacing:inherit;
    }
  }
`;
html = replaceOnce(html, '</style></head>', `${animationCss}</style></head>`, 'style closing tag');

const animationScript = `<script>
  (() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    document.documentElement.classList.add('motion-ready');

    document.addEventListener('DOMContentLoaded', () => {
      const sections = Array.from(document.querySelectorAll('.section'));
      if (!('IntersectionObserver' in window)) {
        sections.forEach(section => section.classList.add('is-visible'));
        return;
      }

      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

      sections.forEach(section => observer.observe(section));

      const hero = document.querySelector('.hero');
      let ticking = false;
      const updateHero = () => {
        const shift = Math.min(window.scrollY * 0.08, 36);
        hero?.style.setProperty('--hero-shift', shift + 'px');
        ticking = false;
      };
      window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(updateHero);
      }, { passive:true });
    });
  })();
</script>`;
html = replaceOnce(html, '<script type="module">', `${animationScript}<script type="module">`, 'module script opening');

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
console.log('Added lightweight Dubai-style motion effects.');
