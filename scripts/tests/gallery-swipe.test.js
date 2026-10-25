const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const cp = require('child_process');

const base = 'b31f1b15b8c5609a125dcce3afa12367da2aba2b';
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
  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    parent.children.splice(parent.children.indexOf(this), 1);
    if (parent.id === 'gallery-container') parent.scrollWidth = parent.children.length * 102 - 6;
    this.parentElement = null;
  }
  scrollIntoView(options) { (this.scrollCalls ||= []).push(options); }
  emit(type, detail = {}) { let prevented = false; this.listeners.get(type)?.({ target: this, preventDefault() { prevented = true; }, ...detail }); return prevented; }
}
function setup({ count = 18, reducedMotion = false, hasGallery = true, deferFrames = false } = {}) {
  const gallery = new Element(); gallery.id = 'gallery-container'; gallery.clientWidth = 300; gallery.scrollWidth = count * 102 - 6; gallery.scrollLeft = 0;
  const wrapper = new Element(); wrapper.append(gallery);
  for (let i = 0; i < count; i++) { const item = new Element(); item.offsetLeft = i * 102; const image = new Element('img'); image.src = `photo-${i}`; image.alt = `Photo ${i + 1}`; item.append(image); gallery.append(item); }
  const sourcePhotos = [...gallery.children];
  const frames = [];
  const flushFrames = () => { while (frames.length) frames.shift()(); };
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
    requestAnimationFrame: fn => deferFrames ? frames.push(fn) : fn(),
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe(target) { observers.push({ fn: this.fn, target }); } },
    setTimeout: () => { throw Error('No autoplay timer allowed'); }, setInterval: () => { throw Error('No autoplay timer allowed'); }
  });
  assert.equal(wrapper.children.length, 1, 'Wait for the invitation to create its photos');
  documentListeners.get('DOMContentLoaded')();
  return { gallery, wrapper, moves, documentListeners, windowListeners, observers, body, history, flushBack, goForward, sourcePhotos, flushFrames };
}

const state = setup();
const { gallery, wrapper, moves } = state;
const [previous, position, next] = wrapper.children[1].children;
const count = position.children[1];
assert.equal(gallery.children.length, 17);
assert.deepEqual(gallery.children.map(item => item.querySelector('img').src), Array.from({ length: 17 }, (_, index) => `photo-${index}`));
assert.equal(state.sourcePhotos[17].parentElement, null, 'The current last photo is omitted from the rendered gallery');
assert.equal(state.sourcePhotos[17].querySelector('img').src, 'photo-17', 'Its source is not destroyed');
assert.equal(gallery.tabIndex, 0);
assert.equal(gallery.attributes.role, 'region');
assert.equal(count.attributes['aria-live'], 'polite');
assert.equal(previous.attributes['aria-controls'], gallery.id);
assert.equal(next.attributes['aria-controls'], gallery.id);
assert.equal(count.textContent, '1–3 / 17');
assert.equal(previous.disabled, true); assert.equal(next.disabled, false);
assert.equal(moves.length, 0, 'No automatic movement');
next.emit('click'); assert.equal(count.textContent, '4–6 / 17'); assert.equal(moves.at(-1).behavior, 'smooth');
next.emit('click'); assert.equal(count.textContent, '7–9 / 17');
for (let i = 0; i < 10; i++) next.emit('click');
assert.equal(count.textContent, '15–17 / 17'); assert.equal(next.disabled, true); assert.equal(gallery.scrollLeft, 1428);
previous.emit('click'); assert.equal(count.textContent, '12–14 / 17');
assert(gallery.emit('keydown', { key: 'Home' })); assert.equal(count.textContent, '1–3 / 17');
assert(gallery.emit('keydown', { key: 'ArrowRight' })); assert.equal(count.textContent, '4–6 / 17');
assert(gallery.emit('keydown', { key: 'ArrowLeft' })); assert.equal(count.textContent, '1–3 / 17');
assert(gallery.emit('keydown', { key: 'End' })); assert.equal(count.textContent, '15–17 / 17');
assert(!gallery.emit('keydown', { key: 'ArrowDown' }), 'Vertical keyboard scrolling remains available');
assert(!gallery.emit('keydown', { key: 'Home', target: next }), 'Ignore keys from other controls');
gallery.scrollLeft = 204; gallery.emit('scroll'); assert.equal(count.textContent, '3–5 / 17', 'Native swipe updates the visible range');
state.observers[0].fn(); state.windowListeners.get('resize')(); assert.equal(count.textContent, '3–5 / 17');
state.documentListeners.get('DOMContentLoaded')(); assert.equal(wrapper.children.length, 3, 'No duplicate controls on repeated setup');
const reduced = setup({ reducedMotion: true }); reduced.wrapper.children[1].children[2].emit('click'); assert.equal(reduced.moves[0].behavior, 'auto');
assert.equal(setup({ hasGallery: false }).wrapper.children.length, 1, 'The outer shell remains unaffected');
assert.equal(setup({ count: 0 }).wrapper.children.length, 1, 'An empty/disabled gallery does not add controls');
// Expand/collapse toggles the same 17 items, preserves order, and restores the swipe position.
const expand = wrapper.children[2];
assert.equal(expand.textContent, '펼치기');
assert.equal(expand.attributes['aria-expanded'], 'false');
assert.equal(expand.attributes['aria-controls'], gallery.id);
assert.equal(gallery.dataset.expanded, 'false');
const retainedItems = [...gallery.children];
expand.emit('click');
assert.equal(expand.textContent, '접기'); assert.equal(expand.attributes['aria-expanded'], 'true');
assert.equal(gallery.dataset.expanded, 'true'); assert.equal(wrapper.children[1].hidden, true);
assert.equal(gallery.scrollLeft, 0); assert.deepEqual(gallery.children, retainedItems);
assert(!gallery.emit('keydown', { key: 'ArrowRight' }), 'Expanded grid keeps ordinary keyboard behavior');
expand.emit('click');
assert.equal(expand.textContent, '펼치기'); assert.equal(expand.attributes['aria-expanded'], 'false');
assert.equal(wrapper.children[1].hidden, false); assert.equal(gallery.scrollLeft, 204);
assert.equal(count.textContent, '3–5 / 17'); assert.equal(wrapper.scrollCalls.length, 1);
const rapid = setup({ deferFrames: true });
const rapidExpand = rapid.wrapper.children[2];
rapidExpand.emit('click'); rapidExpand.emit('click'); rapidExpand.emit('click'); rapid.flushFrames();
assert.equal(rapid.gallery.dataset.expanded, 'true'); assert.equal(rapid.wrapper.scrollCalls, undefined, 'An obsolete collapse callback does not scroll an expanded grid');
rapidExpand.emit('click'); rapid.flushFrames();
assert.equal(rapid.gallery.dataset.expanded, 'false'); assert.equal(rapid.wrapper.scrollCalls.length, 1);
const small = setup({ count: 3 }); assert.equal(small.wrapper.children[2].hidden, true, 'No pointless expand control for a single row');
assert(css.includes('#gallery .gallery-grid[data-expanded="true"]'));
assert(css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'));
assert(css.includes('.gallery-controls[hidden], .gallery-expand[hidden] { display: none; }'));
// Fitted viewer: open, swipe, close, Escape, and browser history restore correctly.
const viewer = state.body.children[0];
const [viewerImage, close, back, forward, viewerCount] = viewer.children;
const photo = gallery.children[2].querySelector('img');
assert.equal(photo.attributes.role, 'button');
photo.emit('click');
assert.equal(viewer.open, true); assert.equal(viewerImage.src, 'photo-2'); assert.equal(viewerCount.textContent, '3 / 17'); assert.equal(state.body.style.overflow, 'hidden');
forward.emit('click'); assert.equal(viewerCount.textContent, '4 / 17');
viewer.emit('keydown', { key: 'ArrowLeft' }); assert.equal(viewerCount.textContent, '3 / 17');
viewer.emit('pointerdown', { target: viewerImage, isPrimary: true, pointerType: 'touch', pointerId: 1, clientX: 200, clientY: 100 });
viewer.emit('pointerup', { target: viewerImage, pointerId: 1, clientX: 100, clientY: 105 }); assert.equal(viewerCount.textContent, '4 / 17');
viewer.emit('click'); assert.equal(viewer.open, true, 'A swipe-generated backdrop click must not dismiss the viewer');
viewer.emit('pointerdown', { target: viewerImage, isPrimary: true, pointerType: 'touch', pointerId: 1, clientX: 200, clientY: 100 });
viewer.emit('pointerdown', { target: viewerImage, isPrimary: false, pointerType: 'touch', pointerId: 2, clientX: 100, clientY: 100 });
viewer.emit('pointerup', { target: viewerImage, pointerId: 1, clientX: 100, clientY: 105 }); assert.equal(viewerCount.textContent, '4 / 17', 'Pinch must not change the photo');
viewer.emit('click'); assert.equal(viewer.open, true, 'A pinch-generated click must not dismiss the viewer');
close.emit('click'); assert.equal(viewer.open, false); assert.equal(state.body.style.overflow, 'auto'); assert.equal(photo.focused, true); assert.equal(viewerImage.src, undefined);
// A fast reopen waits until the prior Back finishes, avoiding a stale close.
gallery.children[7].querySelector('img').emit('click'); assert.equal(viewer.open, false);
state.flushBack(); assert.equal(viewer.open, true); assert.equal(viewerCount.textContent, '8 / 17');
assert(viewer.emit('cancel')); assert.equal(viewer.open, false); state.flushBack();
state.goForward(); assert.equal(viewer.open, true); assert.equal(viewerCount.textContent, '8 / 17');
state.history.back(); state.flushBack(); assert.equal(viewer.open, false); assert.equal(state.body.style.overflow, 'auto');
const firstPhoto = gallery.children[0].querySelector('img'); assert(firstPhoto.emit('keydown', { key: 'Enter' })); assert.equal(viewerCount.textContent, '1 / 17');
back.emit('click'); assert.equal(viewerCount.textContent, '17 / 17', 'Viewer wraps through all photos');
viewer.emit('click', { target: viewerImage }); assert.equal(viewer.open, true, 'A photo click does not close or enlarge again');
viewer.emit('click'); assert.equal(viewer.open, false); state.flushBack();
// The viewer still works from the expanded grid and never exposes the omitted photo.
const expandedState = setup();
const expandedToggle = expandedState.wrapper.children[2];
expandedToggle.emit('click');
const expandedViewer = expandedState.body.children[0];
const [expandedImage, expandedClose, , expandedNext, expandedCount] = expandedViewer.children;
expandedState.gallery.children[16].querySelector('img').emit('click');
assert.equal(expandedImage.src, 'photo-16'); assert.equal(expandedCount.textContent, '17 / 17');
const visibleSources = new Set();
for (let i = 0; i < 17; i++) { visibleSources.add(expandedImage.src); expandedNext.emit('click'); }
assert.equal(visibleSources.size, 17); assert(!visibleSources.has('photo-17'));
expandedClose.emit('click'); expandedState.flushBack();
assert.equal(expandedState.gallery.dataset.expanded, 'true'); assert.equal(expandedState.wrapper.children[1].hidden, true);
expandedToggle.emit('click'); assert.equal(expandedState.gallery.dataset.expanded, 'false');
const resized = setup(); resized.gallery.scrollLeft = 306; resized.gallery.emit('scroll');
const resizedToggle = resized.wrapper.children[2]; resizedToggle.emit('click');
resized.gallery.clientWidth = 360; resized.gallery.scrollWidth = 17 * 122 - 6;
resized.gallery.children.forEach((item, index) => { item.offsetLeft = index * 122; });
resized.windowListeners.get('resize')(); resizedToggle.emit('click');
assert.equal(resized.gallery.scrollLeft, 366, 'Restore the same photo after resizing in expanded mode');
assert.equal(resized.wrapper.children[1].children[1].children[1].textContent, '4–6 / 17');
const future = setup({ count: 19 });
assert.equal(future.gallery.children.length, 18);
assert(!future.gallery.children.some(item => item.querySelector('img').src === 'photo-17'));
assert(future.gallery.children.some(item => item.querySelector('img').src === 'photo-18'), 'Omit the selected eighteenth photo, not any future last photo');
console.log('PASS: retained source, omitted last photo, 17 displayed photos, accessible expand/collapse and interrupted toggles, three-visible carousel, native swipe range, controls, keyboard, reduced motion, no autoplay, fitted viewer open/swipe/close/Escape/Back/Forward, rapid reopen, focus and scroll restoration.');
