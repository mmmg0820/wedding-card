'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('docs/assets/cover-schedule.js','utf8');
const cutoff=Date.parse('2026-11-07T15:00:00+09:00');
let checks=0;
function fixture(now,loaded=true){
  let clock=now,present=loaded,id=0,writes=0;
  const listeners={window:new Map(),document:new Map(),frame:new Map()},timers=new Map(),nodes=new Map(),preloads=[];
  const on=target=>(type,fn)=>{assert(!listeners[target].has(type));listeners[target].set(type,fn);};
  function element(name,text='') {return {id:name,textContent:text,innerHTML:text,dataset:{},hidden:false,children:[],attrs:{},appendChild(node){this.children.push(node);nodes.set(node.id,node);},after(node){nodes.set(node.id,node);},getAttribute(key){return this.attrs[key]??null;},setAttribute(key,value){this.attrs[key]=value;},querySelector(){return null;}};}
  const cover={get textContent(){return this.value||'';},set textContent(value){this.value=value;writes++;}};
  nodes.set('cover-photo-20261016',cover);
  for(const name of ['couple','events','map','charter-bus','gallery','account','comment','player'])nodes.set(name,element(name,'unchanged '+name));
  const intro=element('account-intro','original account introduction');
  const label=element('guide-label','잠시 더 머무는 대전'),note=element('guide-note','original guide introduction');note.tagName='P';
  const guide=element('bottom-etc');guide.attrs.href='https://example.com/wedding-card/etc.html';guide.querySelector=selector=>selector==='span'?label:null;guide.previousElementSibling=note;nodes.set('bottom-etc',guide);
  const links={};for(const name of ['couple','events','map','charter-bus'])links[name]=[element('',name==='couple'?'STORY':name.toUpperCase()),element('',name==='couple'?'STORY':name.toUpperCase())];
  const doc={documentElement:{dataset:{}},getElementById:name=>present?nodes.get(name):null,createElement:()=>element(''),querySelector:selector=>selector==='#account > .account-intro:not(.post-wedding-only)'?intro:null,querySelectorAll:selector=>{const name=selector.match(/^a\[href="#([^"]+)"\]$/)?.[1];assert(name,'Unexpected selector '+selector);return links[name]||[];}};
  const baseURI='https://example.com/wedding-card/';
  const document={baseURI,addEventListener:on('document')};
  const window={addEventListener:on('window'),clearTimeout:n=>timers.delete(n),setTimeout(fn,delay){assert(delay>0&&delay<=60000);timers.set(++id,{fn,delay});return id;}};
  const frame={contentDocument:doc,addEventListener:on('frame')};Object.defineProperty(frame,'srcdoc',{set(){assert.fail('Must not reload invitation');}});
  class Clock extends Date{static now(){return clock;}}
  vm.runInNewContext(source,{window,document,Date:Clock,URL,Image:class{set src(v){preloads.push(v);}}});
  return {api:window.InvitationCover,doc,nodes,links,label,note,guide,intro,cover,timers,preloads,baseURI,get writes(){return writes;},watch(){window.InvitationCover.watch(frame);},setNow(v){clock=v;},tick(){assert.equal(timers.size,1);[...timers.values()][0].fn();},load(){present=true;listeners.frame.get('load')();},event(target,name){listeners[target].get(name)();}};
}
function expectPhase(f,after){
  assert.equal(f.doc.documentElement.dataset.weddingPhase,after?'after':'before');
  const css=f.cover.textContent;
  assert(css.includes(after?'cover-thank-you.png':'cover-main.webp'));
  assert.equal(css.includes('#events,#map,'),after);
  assert(!css.includes('#charter-bus'),'Never hide the return bus');
  for(const name of ['events','map']){assert.equal(f.nodes.get(name).hidden,after);for(const link of f.links[name])assert.equal(link.hidden,after);}
  for(const name of ['charter-bus','gallery','account','comment','player']){assert.equal(f.nodes.get(name).hidden,false);assert.equal(f.nodes.get(name).textContent,'unchanged '+name);}
  assert(f.links['charter-bus'].every(l=>!l.hidden));
  assert(f.links.couple.every(l=>l.textContent===(after?'THANKS':'STORY')));
  assert.equal(f.label.textContent,after?'대전서 좀 더 쉬었다 가유':'잠시 더 머무는 대전');
  assert.equal(f.guide.getAttribute('href'),'https://example.com/wedding-card/'+(after?'etc-thank-you.html':'etc.html'));
  assert.equal(f.note.innerHTML,after?'대전에서 함께 즐기기 좋은<br>카페와 맛집을 남겨두었습니다.':'original guide introduction');
  assert(f.nodes.get('post-wedding-story').innerHTML.includes('함께해 주셔서 감사합니다'));
  assert(f.nodes.get('post-wedding-account-note').innerHTML.includes('마음 전하실 곳은 아래에 남겨두었습니다.'));
  assert.equal(f.intro.innerHTML,'original account introduction');
  assert.equal(f.api.isAfter(),after);
}
for(const zone of ['UTC','Asia/Seoul','America/Los_Angeles','Pacific/Kiritimati']){
 process.env.TZ=zone;
 for(const offset of [-86400000,-1,0,1,86400000]){const f=fixture(cutoff+offset);f.watch();expectPhase(f,offset>=0);assert.equal(f.timers.size,offset<0?1:0);checks++;}
}
{
 const f=fixture(cutoff-1);f.watch();assert.equal([...f.timers.values()][0].delay,1);f.setNow(cutoff);f.tick();expectPhase(f,true);assert.equal(f.timers.size,0);assert.equal(f.preloads.length,1);checks++;
}
for(const [target,event] of [['document','visibilitychange'],['window','pageshow'],['window','focus']]){
 const f=fixture(cutoff-60000);f.watch();f.setNow(cutoff+1000);f.event(target,event);expectPhase(f,true);const writes=f.writes;f.event(target,event);assert.equal(f.writes,writes);assert.equal(f.nodes.get('couple').children.length,1);f.setNow(cutoff-1);f.event(target,event);expectPhase(f,false);checks++;
}
for(const initial of [cutoff-1,cutoff+1]){const f=fixture(initial,false);f.watch();assert.equal([...f.timers.values()][0].delay,100);f.setNow(cutoff+1);f.load();expectPhase(f,true);assert.equal(f.timers.size,0);checks++;}
{
 const f=fixture(cutoff-30*86400000);f.watch();assert.equal([...f.timers.values()][0].delay,60000);f.setNow(cutoff-1);f.tick();expectPhase(f,false);assert.equal([...f.timers.values()][0].delay,1);f.tick();expectPhase(f,false);f.setNow(cutoff);f.tick();expectPhase(f,true);checks++;
}
const index=fs.readFileSync('docs/index.html','utf8');
assert(index.includes('cover-schedule.js?v=20261107-full-thanks'));
assert(index.includes('window.InvitationBus.prepare(updated);'));
assert(index.includes('window.InvitationCover.watch(v);v.srcdoc='));
assert(index.includes("after?'etc-thank-you.html':'etc.html'"));
assert(!index.includes('preview-clock'));
for(const match of index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
const guide=fs.readFileSync('docs/etc-thank-you.html','utf8');
for(const text of ['대전서 좀 더 쉬었다 가유','2025 한화이글스 추천 식당','대전에서 들르는 카페와 디저트'])assert(guide.includes(text));
for(const match of guide.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
checks++;
console.log(`PASS: ${checks} complete thank-you schedule scenarios; exact boundary, four time zones, suspended/late loads, reversible before view, return bus/accounts/gallery/guestbook/audio retained, guide routing and script syntax.`);
