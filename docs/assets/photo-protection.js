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
  for (const type of ['contextmenu', 'dragstart', 'selectstart', 'copy', 'dblclick']) {
    document.addEventListener(type, preventPhotoAction, { capture: true });
  }

  // Single-finger scrolling, taps, links, and account-copy actions remain available.
  const preventPinch = event => {
    if (event.touches?.length > 1) event.preventDefault();
  };
  document.addEventListener('touchstart', preventPinch, { passive: false });
  document.addEventListener('touchmove', preventPinch, { passive: false });
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, event => event.preventDefault(), { passive: false });
  }
})();
