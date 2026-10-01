const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const places = require('../data/local-guide-places.json');
const source = fs.readFileSync('docs/assets/map-links.js', 'utf8');
function runtime(userAgent) {
  const events = {};
  const opened = [];
  const timers = new Map();
  const document = { hidden: false, addEventListener: (name, fn) => { events[name] = fn; }, removeEventListener: name => { delete events[name]; } };
  const window = { top: { location: {} }, open: url => opened.push(url), addEventListener() {}, removeEventListener() {} };
  vm.runInNewContext(source, { document, window, navigator: { userAgent }, URLSearchParams, setTimeout: fn => { timers.set(1, fn); return 1; }, clearTimeout: id => timers.delete(id) });
  return { window, document, events, opened, timers };
}
const guide = fs.readFileSync('docs/etc.html', 'utf8');
assert(guide.includes('assets/map-links.js?v=20261002-tmap'));
assert.equal((guide.match(/data-map-service=/g) || []).length, places.length * 3);
for (const place of [...places, { name: 'BMK웨딩홀', address: '대전 중구 서문로 133', lat: 36.3198898, lng: 127.4051471 }]) {
  for (const service of ['naver', 'kakaomap', 'google']) {
    const android = runtime('Android Chrome');
    android.window.WeddingMaps.open(service, place);
    const intent = android.window.top.location.href;
    assert(intent.startsWith('intent://'));
    const [action, metadata] = intent.split('#Intent;');
    const query = new URL(action.replace('intent://', 'https://')).searchParams;
    if (service === 'naver') {
      assert(action.startsWith('intent://place?'));
      assert.equal(query.get('name'), place.name);
      assert.equal(query.get('lat'), String(place.lat));
      assert.equal(query.get('lng'), String(place.lng));
      assert.equal(query.get('appname'), 'https://mmmg0820.github.io/wedding-card/');
    } else if (service === 'kakaomap') {
      assert(action.startsWith('intent://look?'));
      assert.equal(query.get('p'), `${place.lat},${place.lng}`);
    } else {
      assert.equal(query.get('api'), '1');
      assert.equal(query.get('query'), `${place.lat},${place.lng}`);
      if (place.googlePlaceId) assert.equal(query.get('query_place_id'), place.googlePlaceId);
    }
    assert(metadata.includes('package='));
    const fallback = decodeURIComponent(metadata.match(/S.browser_fallback_url=([^;]+)/)[1]);
    assert(fallback.startsWith('https://'));
    assert.equal(android.opened.length, 0);
    const desktop = runtime('Macintosh Chrome');
    desktop.window.WeddingMaps.open(service, place);
    assert.equal(desktop.opened[0], fallback);
    const ios = runtime('iPhone Safari');
    ios.window.WeddingMaps.open(service, place);
    if (service !== 'google') {
      assert(ios.window.top.location.href.startsWith(service === 'naver' ? 'nmap://place?' : 'kakaomap://look?'));
      ios.document.hidden = true;
      ios.events.visibilitychange();
      assert.equal(ios.timers.size, 0, 'Returning from the app must not trigger the fallback');
    } else assert.equal(ios.opened[0], fallback);
  }
}
const tap = runtime('Android Chrome');
let prevented = false;
tap.events.click({ target: { closest: () => ({ dataset: { mapService: 'kakaomap', placeName: places[0].name, lat: String(places[0].lat), lng: String(places[0].lng) } }) }, button: 0, preventDefault: () => { prevented = true; } });
assert(prevented);
assert(tap.window.top.location.href.startsWith('intent://look?'));
console.log('PASS: venue + 17 places, three services, Android/iOS/desktop targets, missing-app fallbacks and guide click delegation.');
const venue = { name: 'BMK웨딩홀', lat: 36.3198898, lng: 127.4051471 };
const tmapAndroid = runtime('Android Chrome');
tmapAndroid.window.WeddingMaps.open('tmap', venue);
const tmapIntent = tmapAndroid.window.top.location.href;
assert(tmapIntent.startsWith('intent://route?'));
assert(tmapIntent.includes(';scheme=tmap;'));
assert(tmapIntent.includes(';package=com.skt.tmap.ku;'));
const androidParams = new URL(tmapIntent.split('#Intent;')[0].replace('intent://', 'https://')).searchParams;
assert.equal(androidParams.get('goalname'), venue.name);
assert.equal(androidParams.get('goalx'), String(venue.lng));
assert.equal(androidParams.get('goaly'), String(venue.lat));
const storeFallback = decodeURIComponent(tmapIntent.match(/S.browser_fallback_url=([^;]+)/)[1]);
assert.equal(storeFallback, 'https://play.google.com/store/apps/details?id=com.skt.tmap.ku');
const tmapIos = runtime('iPhone Safari');
tmapIos.window.WeddingMaps.open('tmap', venue);
const iosParams = new URL(tmapIos.window.top.location.href).searchParams;
assert.equal(iosParams.get('rGoName'), venue.name);
assert.equal(iosParams.get('rGoX'), String(venue.lng));
assert.equal(iosParams.get('rGoY'), String(venue.lat));
tmapIos.timers.get(1)();
assert.equal(tmapIos.window.top.location.href, 'https://apps.apple.com/kr/app/id431589174');
const tmapOpened = runtime('iPhone Safari');
tmapOpened.window.WeddingMaps.open('tmap', venue);
tmapOpened.document.hidden = true;
tmapOpened.events.visibilitychange();
assert.equal(tmapOpened.timers.size, 0);
const tmapDesktop = runtime('Macintosh Chrome');
tmapDesktop.window.WeddingMaps.open('tmap', venue);
assert.equal(tmapDesktop.opened[0], storeFallback);
console.log('PASS: TMAP venue route parameters, Android package, iOS scheme, installed/missing-app handling and desktop installation link.');
