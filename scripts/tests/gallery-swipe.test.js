const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const cp = require('child_process');

const base = '0f8cb5ed163bc32e2cafff4db92665778ef1a1f2';
const readBase = path => cp.execFileSync('git', ['show', `${base}:${path}`], { maxBuffer: 20 * 1024 * 1024 });
assert.deepEqual(fs.readFileSync('docs/assets/invitation.enc'), readBase('docs/assets/invitation.enc'), 'No encrypted content or photo data changed');
const source = fs.readFileSync('docs/assets/photo-protection.js', 'utf8');
assert(source.includes("['contextmenu', 'dragstart', 'selectstart', 'copy']"), 'Photo save guards remain installed');
const css = fs.readFileSync('docs/assets/photo-protection.css', 'utf8');
assert(css.includes('-webkit-touch-callout: none'));
for (const rule of ['display: flex', 'flex: 0 0 calc((100% - 12px) / 3)', 'overflow-x: auto', 'scroll-snap-type: x mandatory', 'scroll-snap-align: start', 'touch-action: pan-x pan-y']) assert(css.includes(rule), rule);
assert(css.match(/#gallery \.gallery-grid \{[^}]*touch-action: pan-x pan-y/s), 'Vertical page scrolling must remain available');
for (const width of [280, 350, 440]) assert.equal(3 * ((width - 12) / 3) + 2 * 6, width, 'Exactly three photos and two gaps fit the row');

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.textContent = ''; this.style = {}; this.open = false; }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  closest(selector) { if (selector === 'button') return this.tagName === 'button' ? this : null; return this.tagName === 'img' ? this : null; }
  querySelector(selector) { return this.children.find(child => child.tagName === selector) || null; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'src') delete this.src; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  emit(type, detail = {}) { let prevented = false; this.listeners.get(type)?.({ target: this, preventDefault() { prevented = true; }, ...detail }); return prevented; }
}
function setup({ count = 18, reducedMotion = false, hasGallery = true } = {}) {
  const gallery = new Element(); gallery.id = 'gallery-container'; gallery.clientWidth = 300; gallery.scrollWidth = count * 102 - 6; gallery.scrollLeft = 0;
  const wrapper = new Element(); wrapper.append(gallery);
  for (let i = 0; i < count; i++) { const item = new Element(); item.offsetLeft = i * 102; const image = new Element('img'); image.src = `photo-${i}`; image.alt = `Photo ${i + 1}`; item.append(image); gallery.append(item); }
  const moves = [];
  gallery.scrollTo = options => { moves.push(options); gallery.scrollLeft = Math.max(0, Math.min(gallery.scrollWidth - gallery.clientWidth, options.left)); gallery.emit('scroll'); };
  const documentListeners = new Map(); const windowListeners = new Map(); const observers = [];
  const body = new Element('body'); body.style.overflow = 'auto';
  const historyEntries = [null]; let historyIndex = 0; let pendingBack = false;
  const parentListeners = new Map();
  const history = {
    get state() { return historyEntries[historyIndex]; },
    pushState(value) { historyEntries.splice(historyIndex + 1); historyEntries.push(value); historyIndex++; },
    back() { pendingBack = true; }
  };
  const flushBack = () => { assert(pendingBack); pendingBack = false; historyIndex = Math.max(0, historyIndex - 1); parentListeners.get('popstate')({ state: history.state }); };
  const goForward = () => { historyIndex = Math.min(historyEntries.length - 1, historyIndex + 1); parentListeners.get('popstate')({ state: history.state }); };
  const parent = { history, addEventListener: (type, fn) => parentListeners.set(type, fn) };
  vm.runInNewContext(source, {
    Element,
    document: { body, readyState: 'loading', getElementById: id => hasGallery && id === gallery.id ? gallery : body.children.find(child => child.id === id), createElement: tag => new Element(tag), addEventListener: (type, fn) => documentListeners.set(type, fn) },
    window: { parent, matchMedia: () => ({ matches: reducedMotion }), addEventListener: (type, fn) => windowListeners.set(type, fn) },
    requestAnimationFrame: fn => fn(),
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe(target) { observers.push({ fn: this.fn, target }); } },
    setTimeout: () => { throw Error('No autoplay timer allowed'); }, setInterval: () => { throw Error('No autoplay timer allowed'); }
  });
  assert.equal(wrapper.children.length, 1, 'Wait for the invitation to create its photos');
  documentListeners.get('DOMContentLoaded')();
  return { gallery, wrapper, moves, documentListeners, windowListeners, observers, body, history, flushBack, goForward };
}

const state = setup();
const { gallery, wrapper, moves } = state;
const [previous, position, next] = wrapper.children[1].children;
const count = position.children[1];
assert.equal(gallery.children.length, 18);
assert.equal(gallery.tabIndex, 0);
assert.equal(gallery.attributes.role, 'region');
assert.equal(count.attributes['aria-live'], 'polite');
assert.equal(previous.attributes['aria-controls'], gallery.id);
assert.equal(next.attributes['aria-controls'], gallery.id);
assert.equal(count.textContent, '1–3 / 18');
assert.equal(previous.disabled, true); assert.equal(next.disabled, false);
assert.equal(moves.length, 0, 'No automatic movement');
next.emit('click'); assert.equal(count.textContent, '4–6 / 18'); assert.equal(moves.at(-1).behavior, 'smooth');
next.emit('click'); assert.equal(count.textContent, '7–9 / 18');
for (let i = 0; i < 10; i++) next.emit('click');
assert.equal(count.textContent, '16–18 / 18'); assert.equal(next.disabled, true); assert.equal(gallery.scrollLeft, 1530);
previous.emit('click'); assert.equal(count.textContent, '13–15 / 18');
assert(gallery.emit('keydown', { key: 'Home' })); assert.equal(count.textContent, '1–3 / 18');
assert(gallery.emit('keydown', { key: 'ArrowRight' })); assert.equal(count.textContent, '4–6 / 18');
assert(gallery.emit('keydown', { key: 'ArrowLeft' })); assert.equal(count.textContent, '1–3 / 18');
assert(gallery.emit('keydown', { key: 'End' })); assert.equal(count.textContent, '16–18 / 18');
assert(!gallery.emit('keydown', { key: 'ArrowDown' }), 'Vertical keyboard scrolling remains available');
assert(!gallery.emit('keydown', { key: 'Home', target: next }), 'Ignore keys from other controls');
gallery.scrollLeft = 204; gallery.emit('scroll'); assert.equal(count.textContent, '3–5 / 18', 'Native swipe updates the visible range');
state.observers[0].fn(); state.windowListeners.get('resize')(); assert.equal(count.textContent, '3–5 / 18');
state.documentListeners.get('DOMContentLoaded')(); assert.equal(wrapper.children.length, 2, 'No duplicate controls on repeated setup');
const reduced = setup({ reducedMotion: true }); reduced.wrapper.children[1].children[2].emit('click'); assert.equal(reduced.moves[0].behavior, 'auto');
assert.equal(setup({ hasGallery: false }).wrapper.children.length, 1, 'The outer shell remains unaffected');
assert.equal(setup({ count: 0 }).wrapper.children.length, 1, 'An empty/disabled gallery does not add controls');
// Fitted viewer: open, swipe, close, Escape, and browser history restore correctly.
const viewer = state.body.children[0];
const [viewerImage, close, back, forward, viewerCount] = viewer.children;
const photo = gallery.children[2].querySelector('img');
assert.equal(photo.attributes.role, 'button');
photo.emit('click');
assert.equal(viewer.open, true); assert.equal(viewerImage.src, 'photo-2'); assert.equal(viewerCount.textContent, '3 / 18'); assert.equal(state.body.style.overflow, 'hidden');
forward.emit('click'); assert.equal(viewerCount.textContent, '4 / 18');
viewer.emit('keydown', { key: 'ArrowLeft' }); assert.equal(viewerCount.textContent, '3 / 18');
viewer.emit('pointerdown', { target: viewerImage, isPrimary: true, pointerType: 'touch', pointerId: 1, clientX: 200, clientY: 100 });
viewer.emit('pointerup', { target: viewerImage, pointerId: 1, clientX: 100, clientY: 105 }); assert.equal(viewerCount.textContent, '4 / 18');
viewer.emit('click'); assert.equal(viewer.open, true, 'A swipe-generated backdrop click must not dismiss the viewer');
viewer.emit('pointerdown', { target: viewerImage, isPrimary: true, pointerType: 'touch', pointerId: 1, clientX: 200, clientY: 100 });
viewer.emit('pointerdown', { target: viewerImage, isPrimary: false, pointerType: 'touch', pointerId: 2, clientX: 100, clientY: 100 });
viewer.emit('pointerup', { target: viewerImage, pointerId: 1, clientX: 100, clientY: 105 }); assert.equal(viewerCount.textContent, '4 / 18', 'Pinch must not change the photo');
viewer.emit('click'); assert.equal(viewer.open, true, 'A pinch-generated click must not dismiss the viewer');
close.emit('click'); assert.equal(viewer.open, false); assert.equal(state.body.style.overflow, 'auto'); assert.equal(photo.focused, true); assert.equal(viewerImage.src, undefined);
// A fast reopen waits until the prior Back finishes, avoiding a stale close.
gallery.children[7].querySelector('img').emit('click'); assert.equal(viewer.open, false);
state.flushBack(); assert.equal(viewer.open, true); assert.equal(viewerCount.textContent, '8 / 18');
assert(viewer.emit('cancel')); assert.equal(viewer.open, false); state.flushBack();
state.goForward(); assert.equal(viewer.open, true); assert.equal(viewerCount.textContent, '8 / 18');
state.history.back(); state.flushBack(); assert.equal(viewer.open, false); assert.equal(state.body.style.overflow, 'auto');
const firstPhoto = gallery.children[0].querySelector('img'); assert(firstPhoto.emit('keydown', { key: 'Enter' })); assert.equal(viewerCount.textContent, '1 / 18');
back.emit('click'); assert.equal(viewerCount.textContent, '18 / 18', 'Viewer wraps through all photos');
viewer.emit('click', { target: viewerImage }); assert.equal(viewer.open, true, 'A photo click does not close or enlarge again');
viewer.emit('click'); assert.equal(viewer.open, false); state.flushBack();
console.log('PASS: immutable photos, three-visible carousel, native swipe range, controls, keyboard, reduced motion, no autoplay, fitted viewer open/swipe/close/Escape/Back/Forward, rapid reopen, focus and scroll restoration.');
