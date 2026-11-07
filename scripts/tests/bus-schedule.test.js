'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/../../docs/assets/bus-schedule.js', 'utf8');
const index = fs.readFileSync(__dirname + '/../../docs/index.html', 'utf8');
const cutoff = Date.parse('2026-11-07T15:00:00+09:00');
const intro = '먼 길 함께해주셔서 감사합니다.<br>축하해주신 마음을 소중히 간직하며 행복한 부부 생활 꾸려나가겠습니다.<br>돌아가시는 길 버스를 안내드립니다.';
let checks = 0;

function fixture(now, loaded = true) {
  let present = loaded, timerId = 0, writes = 0;
  const listeners = { document: new Map(), window: new Map(), frame: new Map() };
  const timers = new Map();
  function element(value) {
    return {
      get textContent() { return value; }, set textContent(v) { value = v; writes++; },
      get innerHTML() { return value; }, set innerHTML(v) { value = v; writes++; }
    };
  }
  const fields = {
    heading: element('전세버스'), intro: element('오전 안내'), timeLabel: element('출발 일시'),
    timeValue: element('오전 10시 30분'), placeValue: element('노원역 8번 출구')
  };
  const phone = { href: 'tel:01055187878', target: '_top', textContent: '전화하기' };
  const rows = [
    { querySelector: selector => selector === 'dt' ? fields.timeLabel : fields.timeValue },
    { querySelector: selector => selector === 'dd' ? fields.placeValue : null }
  ];
  const section = {
    querySelector: selector => ({ '#charter-bus-title': fields.heading, '.charter-notice-intro': fields.intro })[selector],
    querySelectorAll: selector => { assert.equal(selector, '.charter-notice-details > div'); return rows; }, phone
  };
  const on = target => (type, callback) => { assert(!listeners[target].has(type)); listeners[target].set(type, callback); };
  const document = { addEventListener: on('document') };
  const window = {
    addEventListener: on('window'),
    setTimeout(callback, delay) { assert.equal(delay, 100); const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const frame = { addEventListener: on('frame'), contentDocument: { getElementById(id) { assert.equal(id, 'charter-bus'); return present ? section : null; } } };
  Object.defineProperty(frame, 'srcdoc', { set() { assert.fail('Must not reload the invitation'); } });
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { window, document, Date: Clock });
  return {
    fields, phone, timers, api: window.InvitationBus,
    watch() { window.InvitationBus.watch(frame); },
    event(target, name) { listeners[target].get(name)(); },
    load() { present = true; listeners.frame.get('load')(); },
    get writes() { return writes; }
  };
}
function expectReturn(f) {
  assert.equal(f.fields.heading.textContent, '귀가 버스');
  assert.equal(f.fields.intro.innerHTML, intro);
  assert.equal(f.fields.timeLabel.textContent, '탑승 시간');
  assert.equal(f.fields.timeValue.innerHTML, '<strong>오후 4시</strong>');
  assert.equal(f.fields.placeValue.innerHTML, '<strong>오실 때 내리신 곳과 동일</strong>');
  assert.deepEqual(f.phone, { href: 'tel:01055187878', target: '_top', textContent: '전화하기' });
  assert.equal(f.timers.size, 0);
}
for (const zone of ['UTC', 'Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  process.env.TZ = zone;
  for (const delta of [-86400000, -1, 0, 1, 86400000]) {
    const f = fixture(cutoff + delta); f.watch(); expectReturn(f); checks++;
  }
}
for (const [target, event] of [['document', 'visibilitychange'], ['window', 'pageshow'], ['window', 'focus']]) {
  const f = fixture(cutoff - 60000); f.watch(); const n = f.writes;
  f.event(target, event); expectReturn(f); assert.equal(f.writes, n); checks++;
}
{
  const f = fixture(cutoff - 1, false); f.watch(); assert.equal(f.timers.size, 1);
  f.load(); expectReturn(f); checks++;
}
const sample = '<p>Keep this</p><section class="section charter-notice" id="charter-bus" aria-labelledby="charter-bus-title"><h2 id="charter-bus-title">전세버스</h2><p class="charter-notice-intro">오전 10시 20분 도착</p><dl class="charter-notice-details"><div><dt>출발 일시</dt><dd>11월 7일 토요일<br><strong>오전 10시 30분</strong></dd></div><div><dt>탑승 장소</dt><dd><strong>노원역 8번 출구</strong></dd></div><div><dt>차량번호</dt><dd>경기 78사 6125</dd></div><div><dt>버스회사</dt><dd>한성투어</dd></div><div><dt>기사님</dt><dd>김성군 기사님<a href="tel:01055187878" target="_top">전화하기</a></dd></div></dl></section><p>Keep this too</p>';
const api = fixture(cutoff).api;
const prepared = api.prepare(sample);
assert(prepared.includes(intro));
assert(!prepared.includes('10시 20분') && !prepared.includes('10시 30분') && !prepared.includes('노원역'));
assert(prepared.includes('경기 78사 6125') && prepared.includes('한성투어') && prepared.includes('김성군 기사님'));
assert(prepared.includes('href="tel:01055187878" target="_top"'));
assert(prepared.startsWith('<p>Keep this</p>') && prepared.endsWith('<p>Keep this too</p>'));
assert.equal(api.prepare(prepared), prepared, 'HTML preparation is idempotent');
assert.throws(() => api.prepare('<p>Missing section</p>'));
assert.throws(() => api.prepare(sample + sample));
assert(index.includes('updated=window.InvitationBus.prepare(updated);window.InvitationBus.watch(v);'));
assert(index.includes('window.InvitationCover.watch(v);v.srcdoc='));
assert(index.includes('cover-schedule.js?v=20261107-full-thanks'));
for (const match of index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
checks++;
console.log('PASS: ' + checks + ' immediate return-bus scenarios; four time zones, before/at/after 15:00, exact text, no morning flash, unchanged phone, preserved iframe and cover scheduler.');
