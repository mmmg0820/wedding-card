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
    return `.hero{background-image:url("${url}")!important;background-size:100% 100%!important;background-position:center center!important;background-repeat:no-repeat!important;min-height:0!important;height:auto!important;aspect-ratio:${ratio}!important;padding:0!important;animation:none!important;}.hero .hero-sub,.hero .hero-names,.hero .hero-date,.hero .hero-watermark{display:none!important;}.hero::before,.hero::after{opacity:0!important;}`;
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
      if (coverStyle) {
        const css = rules(document.baseURI);
        if (coverStyle.textContent !== css) coverStyle.textContent = css;
      }
      const remaining = switchAt - Date.now();
      if (remaining > 0) {
        // Recheck the device clock while waiting; never overflow setTimeout.
        timer = window.setTimeout(sync, Math.min(remaining, 60 * 1000));
      }
    }

    // Update only the injected cover style; keep the iframe and player alive.
    frame.addEventListener('load', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    sync();
  }

  window.InvitationCover = { style, watch };
})();
