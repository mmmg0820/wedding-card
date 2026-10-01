const fs = require('fs');
const path = require('path');
const places = require('./data/local-guide-places.json');
const guidePath = path.join(__dirname, '../docs/etc.html');

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let html = fs.readFileSync(guidePath, 'utf8');
let updated = 0;
html = html.replace(/<li><h3>([^<]+)<\/h3>[\s\S]*?<\/li>/g, (item, name) => {
  const place = places.find(place => place.name === name);
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
    throw new Error(`Missing coordinates for ${name}`);
  }
  const { lat, lng } = place;
  const links = [
    ['네이버지도', 'https://map.naver.com/p/?' + new URLSearchParams({ title: name, lng, lat, zoom: 16, type: 0 })],
    ['카카오맵', `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`],
    ['구글맵', 'https://www.google.com/maps/search/?' + new URLSearchParams({ api: 1, query: `${lat},${lng}`, query_place_id: place.googlePlaceId })],
  ];
  const buttons = links.map(([label, url]) =>
    `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(name)} ${label}에서 보기 (새 창)">${label}</a>`
  ).join('');
  if (!item.includes('class="local-guide-address"')) throw new Error(`Missing address for ${name}`);
  updated++;
  return item.replace(/<p class="local-guide-address">[\s\S]*?<\/li>/,
    `<p class="local-guide-address">${escapeHtml(place.address)}</p><div class="local-guide-map-links">${buttons}</div></li>`);
});
if (updated !== 14 || places.length !== updated) throw new Error('Expected exactly 14 places.');
if (!html.includes('.local-guide-map-links{')) {
  html = html.replace('  .local-guide-group summary:focus-visible',
    `  .local-guide-map-links{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; margin-top:12px; }
  .local-guide-map-links a{ justify-content:center; min-height:44px; padding:6px 4px; border:1px solid var(--line); border-radius:8px; background:var(--bg); font-size:.7rem; white-space:nowrap; text-decoration:none; }
  .local-guide-map-links a:hover{ background:white; border-color:var(--accent); }
  .local-guide-group summary:focus-visible`);
}
if ((html.match(/class="local-guide-map-links"/g) || []).length !== 14) throw new Error('Incomplete map buttons.');
fs.writeFileSync(guidePath, html);
console.log('Updated 14 places with coordinate-based Naver, Kakao and Google Maps links.');
