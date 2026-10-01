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
      },
      tmap: {
        app: `tmap://route?goalname=${label}&goalx=${lng}&goaly=${lat}&reqCoordType=WGS84&resCoordType=WGS84`,
        iosApp: `tmap://route?rGoName=${label}&rGoX=${lng}&rGoY=${lat}`,
        package: 'com.skt.tmap.ku',
        web: 'https://play.google.com/store/apps/details?id=com.skt.tmap.ku',
        iosFallback: 'https://apps.apple.com/kr/app/id431589174'
      }
    };
    return links[service] || null;
  }

  function androidIntent(target) {
    const separator = target.app.indexOf('://');
    return `intent://${target.app.slice(separator + 3)}#Intent;scheme=${target.app.slice(0, separator)};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=${target.package};S.browser_fallback_url=${encodeURIComponent(target.web)};end`;
  }

  function open(service, place) {
    if (service === 'kakaonavi') {
      if (window.Kakao?.isInitialized?.()) {
        window.Kakao.Navi.start({ name: place.name, x: Number(place.lng), y: Number(place.lat), coordType: 'wgs84' });
      } else if (typeof window.showToast === 'function') {
        window.showToast('카카오내비 연결을 준비하고 있습니다. 다른 지도 버튼을 이용해주세요.');
      }
      return;
    }
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
        window.top.location.href = target.iosFallback || target.web;
      }, 1800);
      window.top.location.href = target.iosApp || target.app;
    } else {
      window.open(target.web, '_blank', 'noopener,noreferrer');
    }
  }

  window.WeddingMaps = { open, targets, androidIntent };
  function configureKakaoNavi() {
    const button = document.querySelector('[onclick="openMapApp(\'kakaonavi\')"]');
    if (!button) return;
    const key = window.WeddingKakaoNavi?.javascriptKey;
    button.disabled = true;
    button.title = '카카오내비 연결 준비 중';
    button.setAttribute('aria-label', '카카오내비 연결 준비 중');
    if (!/^[a-f0-9]{32}$/i.test(key || '')) return;
    const sdk = document.createElement('script');
    sdk.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
    sdk.onload = () => {
      if (!window.Kakao.isInitialized()) window.Kakao.init(key);
      button.disabled = false;
      button.title = '카카오내비 앱으로 길 안내';
      button.setAttribute('aria-label', '카카오내비 앱으로 열기');
    };
    document.head.appendChild(sdk);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', configureKakaoNavi);
  else configureKakaoNavi();
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
