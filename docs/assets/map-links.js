(function () {
  'use strict';
  const appname = 'https://mmmg0820.github.io/wedding-card/';

  function targets(service, place) {
    const { name, lat, lng, googlePlaceId } = place;
    if (!name || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
    const label = encodeURIComponent(name);
    const coordinates = `${lat},${lng}`;
    const google = 'https://www.google.com/maps/search/?' + new URLSearchParams({
      api: '1', query: coordinates, ...(googlePlaceId ? { query_place_id: googlePlaceId } : {})
    });
    const links = {
      naver: {
        app: `nmap://place?lat=${lat}&lng=${lng}&name=${label}&appname=${encodeURIComponent(appname)}`,
        package: 'com.nhn.android.nmap',
        web: `https://map.naver.com/p/search/${encodeURIComponent(name + ' ' + (place.address || ''))}`
      },
      kakaomap: {
        app: `kakaomap://look?p=${coordinates}`,
        package: 'net.daum.android.map',
        web: `https://map.kakao.com/link/map/${label},${coordinates}`
      },
      google: {
        app: google,
        package: 'com.google.android.apps.maps',
        web: google
      }
    };
    return links[service] || null;
  }

  function androidIntent(target) {
    const separator = target.app.indexOf('://');
    return `intent://${target.app.slice(separator + 3)}#Intent;scheme=${target.app.slice(0, separator)};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=${target.package};S.browser_fallback_url=${encodeURIComponent(target.web)};end`;
  }

  function open(service, place) {
    const target = targets(service, place);
    if (!target) return;
    if (/Android/i.test(navigator.userAgent)) {
      // Navigate the outer page directly from the click, without losing parameters
      // to a web-to-app redirect or opening an empty intermediary browser tab.
      window.top.location.href = androidIntent(target);
    } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && service !== 'google') {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', cleanup);
      };
      const onVisibility = () => { if (document.hidden) cleanup(); };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', cleanup);
      timer = setTimeout(() => {
        cleanup();
        window.top.location.href = target.web;
      }, 1800);
      window.top.location.href = target.app;
    } else {
      window.open(target.web, '_blank', 'noopener,noreferrer');
    }
  }

  window.WeddingMaps = { open, targets, androidIntent };
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-map-service]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(link.dataset.mapService, {
      name: link.dataset.placeName, address: link.dataset.placeAddress,
      lat: link.dataset.lat, lng: link.dataset.lng, googlePlaceId: link.dataset.googlePlaceId
    });
  });
})();
