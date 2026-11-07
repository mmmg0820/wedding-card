(function () {
  'use strict';

  // This fixed instant is independent of the device's time zone.
  // Like the invitation countdown, the schedule uses the device's clock.
  const switchAt = Date.parse('2026-11-07T15:00:00+09:00');
  const styleId = 'cover-photo-20261016';
  const originalImage = 'images/cover-main.webp';
  const thankYouImage = 'images/cover-thank-you.png';

  function rules(baseURI) {
    const after = Date.now() >= switchAt;
    const url = new URL(after ? thankYouImage : originalImage, baseURI).href;
    const ratio = after ? '1118 / 1407' : '1086 / 1367';
    const postWedding = after ? `
      #events,#map,
      a[href="#events"],a[href="#map"]{display:none!important;}
      #couple > :not(.post-wedding-story),#account > .account-intro:not(.post-wedding-only){display:none!important;}
      .post-wedding-only{display:block!important;}
      #couple{padding-top:44px;padding-bottom:44px;}
      .post-wedding-story p{font-size:14px;line-height:2.15;margin:0;color:var(--text-muted);}
      .post-wedding-signature{display:block;margin-top:20px;color:var(--text);letter-spacing:.1em;font-size:13px;}
      .nav-inner{justify-content:center;gap:22px;}
      @media(max-width:380px){.nav-inner{gap:18px;}}
    ` : '';
    return `.post-wedding-only{display:none;}.hero{background-image:url("${url}")!important;background-size:100% 100%!important;background-position:center center!important;background-repeat:no-repeat!important;min-height:0!important;height:auto!important;aspect-ratio:${ratio}!important;padding:0!important;animation:none!important;}.hero .hero-sub,.hero .hero-names,.hero .hero-date,.hero .hero-watermark{display:none!important;}.hero::before,.hero::after{opacity:0!important;}${postWedding}`;
  }

  // Add a reversible presentation layer; the encrypted invitation and its data
  // remain intact, and the before-wedding view retains every original section.
  function syncPresentation(doc, after) {
    if (!doc?.getElementById('couple')) return false;
    doc.documentElement.dataset.weddingPhase = after ? 'after' : 'before';
    const story = doc.getElementById('couple');
    let thanks = doc.getElementById('post-wedding-story');
    if (!thanks) {
      thanks = doc.createElement('div');
      thanks.id = 'post-wedding-story';
      thanks.className = 'post-wedding-story post-wedding-only';
      thanks.innerHTML = '<h2 class="section-title">함께해 주셔서 감사합니다</h2><p>저희의 새로운 시작을<br>함께 축하해 주셔서 감사합니다.<br>보내주신 따뜻한 마음, 오래 간직하겠습니다.<span class="post-wedding-signature">재상 · 진경</span></p>';
      story.appendChild(thanks);
    }
    const originalIntro = doc.querySelector('#account > .account-intro:not(.post-wedding-only)');
    if (originalIntro && !doc.getElementById('post-wedding-account-note')) {
      const note = doc.createElement('div');
      note.id = 'post-wedding-account-note';
      note.className = 'account-intro post-wedding-only';
      note.innerHTML = '<p>보내주신 축하와 따뜻한 마음에 감사드립니다.</p><p>마음 전하실 곳은 아래에 남겨두었습니다.</p>';
      originalIntro.after(note);
    }
    for (const id of ['events', 'map']) {
      const section = doc.getElementById(id);
      if (section) section.hidden = after;
      doc.querySelectorAll('a[href="#' + id + '"]').forEach(link => { link.hidden = after; });
    }
    doc.querySelectorAll('a[href="#couple"]').forEach(link => {
      if (!link.dataset.beforeLabel) link.dataset.beforeLabel = link.textContent;
      link.textContent = after ? 'THANKS' : link.dataset.beforeLabel;
    });
    const guide = doc.getElementById('bottom-etc');
    const guideLabel = guide?.querySelector('span');
    if (guideLabel) {
      if (!guideLabel.dataset.beforeText) guideLabel.dataset.beforeText = guideLabel.textContent;
      guideLabel.textContent = after ? '대전서 좀 더 쉬었다 가유' : guideLabel.dataset.beforeText;
    }
    if (guide) {
      if (!guide.dataset.beforeHref) guide.dataset.beforeHref = guide.getAttribute('href');
      guide.setAttribute('href', after ? new URL('etc-thank-you.html', document.baseURI).href : guide.dataset.beforeHref);
    }
    const guideNote = guide?.previousElementSibling;
    if (guideNote?.tagName === 'P') {
      if (!guideNote.dataset.beforeText) guideNote.dataset.beforeText = guideNote.innerHTML;
      guideNote.innerHTML = after ? '대전에서 함께 즐기기 좋은<br>카페와 맛집을 남겨두었습니다.' : guideNote.dataset.beforeText;
    }
    return true;
  }

  function style(baseURI) {
    return `<style id="${styleId}">${rules(baseURI)}</style>`;
  }

  function watch(frame) {
    let timer;
    // Warm the cache so an already open invitation can swap without a new fetch.
    const nextImage = new Image();
    nextImage.src = new URL(thankYouImage, document.baseURI).href;

    function sync() {
      window.clearTimeout(timer);
      const coverStyle = frame.contentDocument?.getElementById(styleId);
      const ready = coverStyle && syncPresentation(frame.contentDocument, Date.now() >= switchAt);
      if (coverStyle) {
        const css = rules(document.baseURI);
        if (coverStyle.textContent !== css) coverStyle.textContent = css;
      }
      // Do not wait for slow map/image loads before showing the thank-you text.
      if (!ready) { timer = window.setTimeout(sync, 100); return; }
      const remaining = switchAt - Date.now();
      if (remaining > 0) {
        // Recheck the device clock while waiting; never overflow setTimeout.
        timer = window.setTimeout(sync, Math.min(remaining, 60 * 1000));
      }
    }

    // Change the presentation in place; keep the iframe, accounts, guestbook and player alive.
    frame.addEventListener('load', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    sync();
  }

  window.InvitationCover = { style, watch, isAfter: () => Date.now() >= switchAt };
})();
