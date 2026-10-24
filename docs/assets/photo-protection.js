/* Browsers still expose rendered images; screenshots and extraction cannot be prevented. */
(() => {
  'use strict';
  const photoSelector = 'img, .hero, .gallery-item, #event-photo, #l';
  const isPhotoTarget = target => {
    const element = target instanceof Element ? target : target?.parentElement;
    return Boolean(element?.closest(photoSelector));
  };
  const preventPhotoAction = event => {
    if (isPhotoTarget(event.target)) event.preventDefault();
  };

  // Scope save/drag/copy suppression to photos, never account text or form fields.
  for (const type of ['contextmenu', 'dragstart', 'selectstart', 'copy']) {
    document.addEventListener(type, preventPhotoAction, { capture: true });
  }

  // Keep page zoom available; only the open photo viewer suppresses extra zoom.
  const viewerIsOpen = () => Boolean(document.getElementById('photo-viewer')?.open);
  document.addEventListener('dblclick', event => {
    if (viewerIsOpen() && isPhotoTarget(event.target)) event.preventDefault();
  });
  const preventPinch = event => {
    if (viewerIsOpen() && event.touches?.length > 1) event.preventDefault();
  };
  document.addEventListener('touchstart', preventPinch, { passive: false });
  document.addEventListener('touchmove', preventPinch, { passive: false });
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, event => { if (viewerIsOpen()) event.preventDefault(); }, { passive: false });
  }

  const setupGallery = () => {
    const gallery = document.getElementById('gallery-container');
    if (!gallery || gallery.dataset.swipeReady === 'true') return;
    const photos = Array.from(gallery.children);
    if (!photos.length) return;
    gallery.dataset.swipeReady = 'true';
    gallery.tabIndex = 0;
    gallery.setAttribute('role', 'region');
    gallery.setAttribute('aria-label', '사진 갤러리, 좌우로 넘겨 보기');


    const viewer = document.createElement('dialog');
    viewer.id = 'photo-viewer';
    viewer.className = 'photo-viewer';
    viewer.setAttribute('aria-label', '사진 크게 보기');
    const viewerImage = document.createElement('img');
    viewerImage.className = 'photo-viewer-image';
    viewerImage.draggable = false;
    const viewerCount = document.createElement('span');
    viewerCount.className = 'photo-viewer-count';
    viewerCount.setAttribute('aria-live', 'polite');
    const viewerButton = (name, text, label) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = name; button.textContent = text;
      button.setAttribute('aria-label', label);
      return button;
    };
    const close = viewerButton('photo-viewer-close', '×', '사진 닫기');
    const back = viewerButton('photo-viewer-previous', '‹', '이전 사진 보기');
    const forward = viewerButton('photo-viewer-next', '›', '다음 사진 보기');
    viewer.append(viewerImage, close, back, forward, viewerCount);
    document.body.append(viewer);
    const navigationWindow = window.parent || window;
    const historyKey = 'weddingPhotoViewer';
    const historyToken = String(Date.now());
    let viewerIndex = 0;
    let viewerTrigger = null;
    let savedOverflow = '';
    let historyClosing = false;
    let pendingOpen = null;
    const showPhoto = index => {
      viewerIndex = (index + photos.length) % photos.length;
      const image = photos[viewerIndex].querySelector('img');
      viewerImage.src = image.src;
      viewerImage.alt = image.alt;
      viewerCount.textContent = `${viewerIndex + 1} / ${photos.length}`;
    };
    const hideViewer = () => {
      if (!viewer.open) return;
      viewer.close();
      document.body.style.overflow = savedOverflow;
      viewerImage.removeAttribute('src');
      viewerTrigger?.focus({ preventScroll: true });
    };
    const openViewer = (index, trigger, addHistory = true) => {
      if (historyClosing) { pendingOpen = { index, trigger }; return; }
      viewerTrigger = trigger;
      showPhoto(index);
      if (!viewer.open) {
        savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        viewer.showModal();
        close.focus({ preventScroll: true });
        if (addHistory) navigationWindow.history.pushState({ ...navigationWindow.history.state, [historyKey]: historyToken }, '');
      }
    };
    const closeViewer = () => {
      hideViewer();
      if (navigationWindow.history.state?.[historyKey] === historyToken && !historyClosing) {
        historyClosing = true;
        navigationWindow.history.back();
      }
    };
    navigationWindow.addEventListener('popstate', event => {
      historyClosing = false;
      if (event.state?.[historyKey] === historyToken) openViewer(viewerIndex, viewerTrigger, false);
      else hideViewer();
      if (pendingOpen) { const pending = pendingOpen; pendingOpen = null; openViewer(pending.index, pending.trigger); }
    });
    close.addEventListener('click', closeViewer);
    back.addEventListener('click', () => showPhoto(viewerIndex - 1));
    forward.addEventListener('click', () => showPhoto(viewerIndex + 1));
    let suppressBackdropClick = false;
    viewer.addEventListener('click', event => {
      if (suppressBackdropClick) { suppressBackdropClick = false; event.preventDefault(); return; }
      if (event.target === viewer) closeViewer();
    });
    viewer.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
    viewer.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); showPhoto(viewerIndex + (event.key === 'ArrowLeft' ? -1 : 1));
      }
    });
    let swipe = null;
    viewer.addEventListener('pointerdown', event => {
      if (!event.isPrimary) { swipe = null; suppressBackdropClick = true; return; }
      suppressBackdropClick = false;
      if (event.pointerType !== 'touch' || event.target.closest('button')) return;
      swipe = { x: event.clientX, y: event.clientY, id: event.pointerId };
    });
    viewer.addEventListener('pointercancel', () => { swipe = null; });
    viewer.addEventListener('pointerup', event => {
      if (!swipe || event.pointerId !== swipe.id) return;
      const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) suppressBackdropClick = true;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) showPhoto(viewerIndex + (dx < 0 ? 1 : -1));
    });
    photos.forEach((item, index) => {
      const image = item.querySelector('img');
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', `갤러리 사진 ${index + 1} 크게 보기`);
      image.addEventListener('click', () => openViewer(index, image));
      image.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openViewer(index, image); }
      });
    });

    const controls = document.createElement('div');
    controls.className = 'gallery-controls';
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.textContent = '‹';
    previous.setAttribute('aria-label', '이전 사진 3장 보기');
    previous.setAttribute('aria-controls', gallery.id);
    const position = document.createElement('div');
    position.className = 'gallery-position';
    const hint = document.createElement('span');
    hint.textContent = '좌우로 넘겨 보세요';
    const count = document.createElement('span');
    count.setAttribute('role', 'status');
    count.setAttribute('aria-live', 'polite');
    position.append(hint, count);
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = '›';
    next.setAttribute('aria-label', '다음 사진 3장 보기');
    next.setAttribute('aria-controls', gallery.id);
    controls.append(previous, position, next);
    gallery.parentElement.append(controls);

    const step = () => photos.length > 1 ? photos[1].offsetLeft - photos[0].offsetLeft : gallery.clientWidth;
    const firstVisible = () => Math.max(0, Math.min(photos.length - 3, Math.round(gallery.scrollLeft / (step() || 1))));
    const update = () => {
      const first = firstVisible();
      const label = `${first + 1}–${Math.min(first + 3, photos.length)} / ${photos.length}`;
      if (count.textContent !== label) count.textContent = label;
      previous.disabled = gallery.scrollLeft <= 1;
      next.disabled = gallery.scrollLeft >= gallery.scrollWidth - gallery.clientWidth - 1;
    };
    const moveTo = index => {
      const target = Math.max(0, Math.min(photos.length - 3, index));
      gallery.scrollTo({
        left: photos[target].offsetLeft - photos[0].offsetLeft,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
    };
    previous.addEventListener('click', () => moveTo(firstVisible() - 3));
    next.addEventListener('click', () => moveTo(firstVisible() + 3));
    gallery.addEventListener('keydown', event => {
      if (event.target !== gallery) return;
      const targets = { ArrowLeft: firstVisible() - 3, ArrowRight: firstVisible() + 3, Home: 0, End: photos.length - 3 };
      if (!(event.key in targets)) return;
      event.preventDefault();
      moveTo(targets[event.key]);
    });
    let queued = false;
    gallery.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; update(); });
    }, { passive: true });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(gallery);
    window.addEventListener('resize', update, { passive: true });
    update();
  };
  // The invitation's existing DOMContentLoaded handler creates the photo elements first.
  if (document.readyState === 'complete') setupGallery();
  else document.addEventListener('DOMContentLoaded', setupGallery, { once: true });
})();
