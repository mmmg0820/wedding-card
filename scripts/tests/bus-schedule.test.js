'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/../../docs/assets/bus-schedule.js', 'utf8');
const cutoff = Date.parse('2026-11-07T15:00:00+09:00');
let checks = 0;

function fixture(now, loaded = true) {
  let clock = now, present = loaded, timerId = 0, writes = 0;
  const listeners = { document: new Map(), window: new Map(), frame: new Map() };
  const timers = new Map();
  function element(value) {
    return {
      get textContent() { return value; }, set textContent(v) { value = v; writes++; },
      get innerHTML() { return value; }, set innerHTML(v) { value = v; writes++; }
    };
  }
  const heading = element('전세버스');
  const intro = element('전세버스 안내<br><strong>10시 20분까지 도착해 주세요.</strong>');
  const timeLabel = element('출발 일시');
  const timeValue = element('11월 7일 토요일<br><strong>오전 10시 30분</strong>');
  const placeValue = element('<strong>노원역 8번 출구</strong>');
  const phone = { href: 'tel:01055187878', target: '_top', textContent: '전화하기' };
  const rows = [
    { querySelector: selector => selector === 'dt' ? timeLabel : timeValue },
    { querySelector: selector => selector === 'dd' ? placeValue : null }
  ];
  const section = {
    querySelector: selector => ({ '#charter-bus-title': heading, '.charter-notice-intro': intro })[selector],
    querySelectorAll: selector => {
      assert.equal(selector, '.charter-notice-details > div'); return rows;
    }, phone
  };
  const on = target => (type, callback) => { assert(!listeners[target].has(type)); listeners[target].set(type, callback); };
  const document = { addEventListener: on('document') };
  const window = {
    addEventListener: on('window'),
    setTimeout(callback, delay) { assert(delay > 0 && delay <= 60000); const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const frame = { addEventListener: on('frame'), contentDocument: { getElementById(id) { assert.equal(id, 'charter-bus'); return present ? section : null; } } };
  Object.defineProperty(frame, 'srcdoc', { set() { assert.fail('The invitation must not be reloaded.'); } });
  class Clock extends Date { static now() { return clock; } }
  vm.runInNewContext(source, { window, document, Date: Clock });
  return {
    heading, intro, timeLabel, timeValue, placeValue, phone, timers,
    watch() { window.InvitationBus.watch(frame); },
    setNow(value) { clock = value; },
    event(target, name) { listeners[target].get(name)(); },
    load() { present = true; listeners.frame.get('load')(); },
    tick() { assert.equal(timers.size, 1); [...timers.values()][0].callback(); },
    get writes() { return writes; }
  };
}

function expectBefore(f) {
  assert.equal(f.heading.textContent, '전세버스');
  assert(f.intro.innerHTML.includes('10시 20분'));
  assert.equal(f.timeLabel.textContent, '출발 일시');
  assert(f.timeValue.innerHTML.includes('오전 10시 30분'));
  assert(f.placeValue.innerHTML.includes('노원역 8번 출구'));
}
function expectAfter(f) {
  assert.equal(f.heading.textContent, '귀가 버스');
  assert(!f.intro.innerHTML.includes('10시 20분'));
  assert.equal(f.timeLabel.textContent, '탑승 시간');
  assert.equal(f.timeValue.innerHTML, '<strong>오후 4시</strong>');
  assert.equal(f.placeValue.innerHTML, '<strong>오실 때 내리신 곳과 동일</strong>');
  assert.deepEqual(f.phone, { href: 'tel:01055187878', target: '_top', textContent: '전화하기' });
}
for (const zone of ['UTC', 'Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  process.env.TZ = zone;
  for (const delta of [-1, 0, 1]) {
    const f = fixture(cutoff + delta); f.watch();
    if (delta < 0) { expectBefore(f); assert.equal(f.writes, 0); assert.equal(f.timers.size, 1); }
    else { expectAfter(f); assert.equal(f.timers.size, 0); }
    checks++;
  }
}
{
  const f = fixture(cutoff - 1); f.watch();
  assert.equal([...f.timers.values()][0].delay, 1);
  f.setNow(cutoff); f.tick(); expectAfter(f);
  assert.equal(f.timers.size, 0); checks++;
}
for (const [target, event] of [['document', 'visibilitychange'], ['window', 'pageshow'], ['window', 'focus']]) {
  const f = fixture(cutoff - 60000); f.watch();
  f.setNow(cutoff + 5000); f.event(target, event); expectAfter(f);
  const n = f.writes; f.event(target, event); assert.equal(f.writes, n);
  f.setNow(cutoff - 1); f.event(target, event); expectBefore(f);
  checks++;
}
{
  const f = fixture(cutoff - 30 * 86400000); f.watch();
  assert.equal([...f.timers.values()][0].delay, 60000);
  f.setNow(cutoff - 1); f.tick(); expectBefore(f);
  f.tick(); expectBefore(f); f.setNow(cutoff); f.tick(); expectAfter(f); checks++;
}
{
  const f = fixture(cutoff - 1, false); f.watch(); f.setNow(cutoff); f.load(); expectAfter(f); checks++;
}
{
  const f = fixture(cutoff + 1000, false); f.watch();
  assert.equal([...f.timers.values()][0].delay, 100);
  f.tick(); assert.equal(f.writes, 0);
  f.load(); expectAfter(f); assert.equal(f.timers.size, 0); checks++;
}
const index = fs.readFileSync(__dirname + '/../../docs/index.html', 'utf8');
assert(index.indexOf('src="assets/bus-schedule.js') < index.indexOf('window.InvitationBus.watch(v)'));
assert(index.includes('window.InvitationBus.watch(v);window.InvitationCover.watch(v);v.srcdoc='));
assert(index.includes('경기 78사 6125') && index.includes('김성군 기사님') && index.includes('한성투어'));
for (const match of index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
console.log('PASS: ' + checks + ' return-bus scenarios, exact boundary, four time zones, open page, late load, resumed page, restored morning view, no duplicate writes, preserved phone and iframe.');
