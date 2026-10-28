'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('docs/assets/cover-schedule.js', 'utf8');
const cutoff = Date.parse('2026-11-07T06:00:00Z');
assert.equal(cutoff, Date.parse('2026-11-07T15:00:00+09:00'));
let assertions = 0;

function fixture(now, loaded = true) {
  const listeners = { document: new Map(), window: new Map(), frame: new Map() };
  const timers = new Map();
  const preloads = [];
  const writes = [];
  let timerId = 0;
  let clock = now;
  let present = loaded;
  const baseURI = 'https://example.com/wedding-card/';
  const cover = {
    get textContent() { return writes.at(-1) || ''; },
    set textContent(value) { writes.push(value); }
  };
  const listener = target => (type, callback) => {
    assert(!listeners[target].has(type), 'Only one listener per lifecycle event');
    listeners[target].set(type, callback);
  };
  class Clock extends Date { static now() { return clock; } }
  const document = { baseURI, addEventListener: listener('document') };
  const window = {
    addEventListener: listener('window'),
    setTimeout(callback, delay) {
      assert(delay > 0 && delay <= 60000, 'Timer is positive and bounded');
      const id = ++timerId; timers.set(id, { callback, delay }); return id;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  const frame = {
    addEventListener: listener('frame'),
    contentDocument: { getElementById(id) {
      assert.equal(id, 'cover-photo-20261016', 'Only the cover style is touched');
      return present ? cover : null;
    } }
  };
  Object.defineProperty(frame, 'srcdoc', {
    set() { assert.fail('Switching covers must not reload the iframe'); }
  });
  vm.runInNewContext(source, {
    window, document, URL, Date: Clock,
    Image: class { set src(value) { preloads.push(value); } }
  });
  return {
    api: window.InvitationCover, baseURI, timers, writes, preloads, cover,
    setNow(value) { clock = value; },
    load() { present = true; listeners.frame.get('load')(); },
    event(target, type) { listeners[target].get(type)(); },
    tick() { assert.equal(timers.size, 1); const task = [...timers.values()][0]; task.callback(); },
    watch() { window.InvitationCover.watch(frame); }
  };
}

for (const zone of ['UTC', 'Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  process.env.TZ = zone;
  for (const [offset, filename, ratio] of [
    [-1, 'cover-main.webp', '1086 / 1367'],
    [0, 'cover-thank-you.png', '1118 / 1407'],
    [1, 'cover-thank-you.png', '1118 / 1407']
  ]) {
    const f = fixture(cutoff + offset);
    const css = f.api.style(f.baseURI);
    assert(css.includes('/images/' + filename), zone + ': correct cover at offset ' + offset);
    assert(css.includes('aspect-ratio:' + ratio));
    assert(css.includes('background-size:100% 100%'));
    f.watch();
    assert(f.cover.textContent.includes(filename));
    assert.equal(f.timers.size, offset < 0 ? 1 : 0);
    assertions++;
  }
}

{
  const f = fixture(cutoff - 1);
  f.watch();
  assert.equal([...f.timers.values()][0].delay, 1);
  f.setNow(cutoff); f.tick();
  assert(f.cover.textContent.includes('cover-thank-you.png'));
  assert.equal(f.timers.size, 0);
  assert.equal(f.preloads.length, 1);
  assert(f.preloads[0].endsWith('images/cover-thank-you.png'));
  assertions++;
}
{
  const f = fixture(cutoff - 30 * 86400000);
  f.watch(); assert.equal([...f.timers.values()][0].delay, 60000);
  f.setNow(cutoff - 1); f.tick();
  assert.equal([...f.timers.values()][0].delay, 1);
  // A premature callback must rearm instead of switching early.
  f.tick(); assert(f.cover.textContent.includes('cover-main.webp'));
  f.setNow(cutoff + 1); f.tick();
  assert(f.cover.textContent.includes('cover-thank-you.png'));
  assertions++;
}
for (const [target, event] of [
  ['document', 'visibilitychange'], ['window', 'pageshow'], ['window', 'focus']
]) {
  const f = fixture(cutoff - 60000);
  f.watch();
  // Model a suspended tab: wall clock passes cutoff, timer never fires.
  f.setNow(cutoff + 5000); f.event(target, event);
  assert(f.cover.textContent.includes('cover-thank-you.png'));
  assert.equal(f.timers.size, 0);
  const count = f.writes.length; f.event(target, event);
  assert.equal(f.writes.length, count, 'No repeated DOM writes after switching');
  assertions++;
}
{
  const f = fixture(cutoff - 1, false);
  f.watch(); f.setNow(cutoff); f.load();
  assert(f.cover.textContent.includes('cover-thank-you.png'));
  assert.equal(f.timers.size, 0);
  assertions++;
}
const index = fs.readFileSync('docs/index.html', 'utf8');
assert(index.includes('const coverCSS=window.InvitationCover.style(d.baseURI);'));
assert(index.includes('window.InvitationCover.watch(v);v.srcdoc='));
assert(index.indexOf('src="assets/cover-schedule.js') < index.indexOf('window.InvitationCover.style'));
for (const match of index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) new vm.Script(match[1]);
}
console.log('PASS: ' + assertions + ' cover schedule scenarios; four time zones, exact boundary, open-page timer, suspended-page return, late iframe load, bounded timers, iframe preservation, inline syntax.');
