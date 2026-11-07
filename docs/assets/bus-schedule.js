(function () {
  'use strict';

  const switchAt = Date.parse('2026-11-07T15:00:00+09:00');

  function watch(frame) {
    let timer;
    let state;

    function sync() {
      window.clearTimeout(timer);
      const doc = frame.contentDocument;
      const section = doc?.getElementById('charter-bus');
      if (section) {
        if (state?.section !== section) {
          const heading = section.querySelector('#charter-bus-title');
          const intro = section.querySelector('.charter-notice-intro');
          const rows = section.querySelectorAll('.charter-notice-details > div');
          const timeLabel = rows[0]?.querySelector('dt');
          const timeValue = rows[0]?.querySelector('dd');
          const placeValue = rows[1]?.querySelector('dd');
          if (heading && intro && timeLabel && timeValue && placeValue) {
            state = {
              section, heading, intro, timeLabel, timeValue, placeValue,
              before: [heading.textContent, intro.innerHTML, timeLabel.textContent,
                timeValue.innerHTML, placeValue.innerHTML],
              phase: 'before'
            };
          }
        }
        const after = Date.now() >= switchAt;
        const phase = after ? 'after' : 'before';
        if (state?.section === section && state.phase !== phase) {
          const content = after ? [
            '귀가 버스',
            '함께해 주셔서 감사합니다.<br>귀가 버스는 아래 시간과 장소에서 탑승해 주세요.',
            '탑승 시간',
            '<strong>오후 4시</strong>',
            '<strong>오실 때 내리신 곳과 동일</strong>'
          ] : state.before;
          state.heading.textContent = content[0];
          state.intro.innerHTML = content[1];
          state.timeLabel.textContent = content[2];
          state.timeValue.innerHTML = content[3];
          state.placeValue.innerHTML = content[4];
          state.phase = phase;
        }
      }
      // The iframe load event may wait on maps and images. Apply the bus
      // details as soon as its DOM exists, including a first visit after 15:00.
      if (!section) { timer = window.setTimeout(sync, 100); return; }
      const remaining = switchAt - Date.now();
      if (remaining > 0) timer = window.setTimeout(sync, Math.min(remaining, 60000));
    }

    // Match the thank-you cover's schedule without reloading the invitation,
    // interrupting its music, or replacing the driver call link.
    frame.addEventListener('load', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    sync();
  }

  window.InvitationBus = { watch };
})();
