(function () {
  'use strict';

  // The return-bus notice is effective immediately and stays the same when
  // the independently scheduled thank-you cover changes at 15:00 KST.
  const content = {
    heading: '귀가 버스',
    intro: '먼 길 함께해주셔서 감사합니다.<br>축하해주신 마음을 소중히 간직하며 행복한 부부 생활 꾸려나가겠습니다.<br>돌아가시는 길 버스를 안내드립니다.',
    timeLabel: '탑승 시간',
    timeValue: '<strong>오후 4시</strong>',
    placeValue: '<strong>오실 때 내리신 곳과 동일</strong>'
  };

  function replaceOnce(html, pattern, replacement) {
    if ((html.match(pattern) || []).length !== 1) throw Error('Unexpected charter bus markup');
    return html.replace(pattern, replacement);
  }

  function prepare(html) {
    const pattern = /<section\b[^>]*\bid="charter-bus"[^>]*>[\s\S]*?<\/section>/g;
    const matches = html.match(pattern);
    if (!matches || matches.length !== 1) throw Error('Unexpected charter bus section');
    let section = matches[0];
    section = replaceOnce(section, /(<h2\b[^>]*\bid="charter-bus-title"[^>]*>)[\s\S]*?(<\/h2>)/g,
      (_, start, end) => start + content.heading + end);
    section = replaceOnce(section, /(<p class="charter-notice-intro">)[\s\S]*?(<\/p>)/g,
      (_, start, end) => start + content.intro + end);
    section = replaceOnce(section, /<div><dt>(?:출발 일시|탑승 시간)<\/dt><dd>[\s\S]*?<\/dd><\/div>/g,
      '<div><dt>' + content.timeLabel + '</dt><dd>' + content.timeValue + '</dd></div>');
    section = replaceOnce(section, /<div><dt>탑승 장소<\/dt><dd>[\s\S]*?<\/dd><\/div>/g,
      '<div><dt>탑승 장소</dt><dd>' + content.placeValue + '</dd></div>');
    return html.replace(matches[0], section);
  }

  function watch(frame) {
    let timer;
    function sync() {
      window.clearTimeout(timer);
      const section = frame.contentDocument?.getElementById('charter-bus');
      const heading = section?.querySelector('#charter-bus-title');
      const intro = section?.querySelector('.charter-notice-intro');
      const rows = section?.querySelectorAll('.charter-notice-details > div');
      const timeLabel = rows?.[0]?.querySelector('dt');
      const timeValue = rows?.[0]?.querySelector('dd');
      const placeValue = rows?.[1]?.querySelector('dd');
      if (!heading || !intro || !timeLabel || !timeValue || !placeValue) {
        timer = window.setTimeout(sync, 100); return;
      }
      if (heading.textContent !== content.heading) heading.textContent = content.heading;
      if (intro.innerHTML !== content.intro) intro.innerHTML = content.intro;
      if (timeLabel.textContent !== content.timeLabel) timeLabel.textContent = content.timeLabel;
      if (timeValue.innerHTML !== content.timeValue) timeValue.innerHTML = content.timeValue;
      if (placeValue.innerHTML !== content.placeValue) placeValue.innerHTML = content.placeValue;
    }

    // Keep the iframe, music player and driver's native telephone link intact.
    frame.addEventListener('load', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    sync();
  }

  window.InvitationBus = { prepare, watch };
})();
