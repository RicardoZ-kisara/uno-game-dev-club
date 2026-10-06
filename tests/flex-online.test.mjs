// Run against a local Node server with a dedicated test database only.
// UNO_TEST_DB must name that server's rooms.sqlite; never use a live game's DB.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile} from 'node:fs/promises';
import {newGame,makeDeck} from '../lib/game.ts';
const {chromium}=await import(process.env.UNO_PLAYWRIGHT_MODULE??'playwright');
const base=process.env.UNO_TEST_URL??'http://127.0.0.1:5173';
assert.ok(process.env.UNO_TEST_DB,'Use a dedicated local test DB and set UNO_TEST_DB');
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Fixtures are local only');
const db=new DatabaseSync(process.env.UNO_TEST_DB);
const browser=await chromium.launch({headless:true,...(process.env.UNO_CHROME_PATH?{executablePath:process.env.UNO_CHROME_PATH}:{})});
const checks={},errors=[];
const deck=makeDeck('flex',()=>.5),find=(color,kind,flex=false)=>deck.find(c=>c.a.color===color&&c.a.kind===kind&&!!c.a.flex===flex);
const names=['QA1','QA2','QA3','QA4'].map((name,avatar)=>({name,avatar}));
function state(){
 const g=newGame('flex',names,{stacking:true,jumpIn:true,dealer:3});
 g.turn=1;g.phase='playing';g.color='red';g.pending=null;g.events=[];
 g.players.forEach((p,i)=>{p.hand=[deck.find(c=>c.a.color==='blue'&&c.a.n===i+1&&!c.a.flex)];p.power=true});
 g.discard=[find('red','draw2')];return g;
}
async function call(body,token){const r=await fetch(base+'/api/room',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
async function get(room,i=1){return fetch(`${base}/api/room?code=${room.code}`,{headers:{Authorization:`Bearer ${room.tokens[i]}`}}).then(r=>r.json())}
async function create(g){
 const made=await call({op:'create',mode:'flex',name:names[0].name,stacking:g.stacking,jumpIn:true});assert.equal(made.status,200);
 const room={code:made.data.code,tokens:[made.data.token]};
 for(let i=1;i<4;i++){const r=await call({op:'join',code:room.code,mode:'flex',name:names[i].name});assert.equal(r.status,200);room.tokens.push(r.data.token)}
 // Mutate only this just-created room. No existing or user room is read or changed.
 const stored=db.prepare('SELECT data FROM rooms WHERE code=?').get(room.code),data=JSON.parse(stored.data);data.game=g;
 db.prepare('UPDATE rooms SET data=?,version=version+1 WHERE code=?').run(JSON.stringify(data),room.code);
 return room;
}
async function pageFor(room,i=1,fallback=false,viewport={width:390,height:844}){
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 if(fallback)await page.routeWebSocket('**/api/room/socket?**',ws=>ws.close());
 await page.addInitScript(({code,token})=>{localStorage.setItem(`uno-room-${code}`,JSON.stringify({token}));localStorage.setItem('uno-prefs',JSON.stringify({effects:false,touchTapToPlay:true}))},{code:room.code,token:room.tokens[i]});
 await page.goto(`${base}/flex?room=${room.code}`);await page.locator('[data-hand-slot]').first().waitFor();
 return {page,context};
}
async function touch(page,id,swipe=false){
 // Hit an exposed portion of the slot; selected neighbors overlap fixed slots.
 const p=await page.locator(`[data-hand-slot="${id}"]`).evaluate(el=>{
  const r=el.getBoundingClientRect(),y=r.top+65;
  for(let x=r.left+4;x<r.right-4;x+=4)if(document.elementFromPoint(x,y)?.closest('[data-hand-slot]')===el)return {x,y};
  throw Error('No exposed touch point for '+el.dataset.handSlot);
 });
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
 if(swipe)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y-80}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
async function submit(room,actor,action,revision){return call({op:'action',code:room.code,revision:revision??(await get(room,actor)).revision,requestId:crypto.randomUUID(),action},room.tokens[actor])}
async function assertReason(page,room,card,pattern){
 const before=(await get(room)).revision;await touch(page,card.id);await page.locator('.play-rejection').waitFor();
 assert.match(await page.locator('.play-rejection').innerText(),pattern);
 await touch(page,card.id,true);assert.equal((await get(room)).revision,before,'refused swipe leaves server state unchanged');
 const box=await page.locator('.play-rejection').boundingBox(),viewport=page.viewportSize();assert.ok(box.x>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height,'touch reason is visible');
}
try{
 await mkdir('outputs/flex-qa',{recursive:true});
 for(const fallback of [false,true]){
  const transport=fallback?'http':'ws';
  const g=state(),reply=find('blue','draw2',true);g.pending={amount:2,kind:'draw2',source:0,target:1,challenge:false};g.players[1].hand.unshift(reply);
  const room=await create(g),{page,context}=await pageFor(room,1,fallback);let submitted;
  page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/room'))submitted=r.postDataJSON()});
  assert.equal(await page.locator('.flex-toggle').getAttribute('aria-disabled'),'true');
  const toggle=await page.locator('.flex-toggle').boundingBox();await page.touchscreen.tap(toggle.x+toggle.width/2,toggle.y+toggle.height/2);await page.getByText('强化效果不允许叠加，请使用普通效果',{exact:true}).waitFor();
  await touch(page,reply.id,true);await page.waitForFunction(id=>!document.querySelector(`[data-hand-slot="${id}"]`),reply.id);
  assert.equal(submitted.action.flex,false);assert.equal((await get(room)).game.pending.amount,4);checks[`${transport}CrossColorPlus2`]='passed';
  await page.reload();await page.locator('[data-hand-slot]').first().waitFor();assert.equal((await get(room)).viewer,1);checks[`${transport}Reconnect`]='passed';await context.close();

  // A real duplicate wild +4 jumps while the recipient has armed FLEX.
  const incoming=state(),wilds=deck.filter(c=>c.a.kind==='wild4');incoming.discard=[wilds[0]];incoming.players[0].hand.push(wilds[1]);incoming.players[1].hand.unshift(reply,wilds[2]);
  const live=await create(incoming),recipient=await pageFor(live,1,fallback),observer=await pageFor(live,2,fallback);
  await recipient.page.locator('.flex-toggle').tap();assert.equal(await recipient.page.locator('.flex-toggle').getAttribute('aria-pressed'),'true');
  const jumped=await submit(live,0,{type:'play',id:wilds[1].id,color:'red',flex:false});assert.equal(jumped.status,200,JSON.stringify(jumped.data));
  await recipient.page.waitForFunction(()=>document.querySelector('.flex-toggle')?.getAttribute('aria-disabled')==='true');
  assert.equal(await recipient.page.locator('.flex-toggle').getAttribute('aria-pressed'),'false');
  await assertReason(recipient.page,live,reply,/上一张印刷加牌值为 \+4，不能接 \+2/);
  await recipient.page.screenshot({path:`outputs/flex-qa/${transport}-plus4-refusal.png`});
  const own=await get(live,1),other=await get(live,2);own.game.players.forEach((p,i)=>assert.equal(p.hand.length,i===1?p.count:0));other.game.players.forEach((p,i)=>assert.equal(p.hand.length,i===2?p.count:0));
  assert.deepEqual(own.game.legal.map(l=>l.id),own.game.players[1].hand.map(c=>c.id));assert.equal(own.game.pending.proof,undefined);assert.equal(own.game.pending.illegal,undefined);
  checks[`${transport}PendingResetsArmedAndPrivateReasons`]='passed';
  await touch(recipient.page,wilds[2].id,true);await recipient.page.getByRole('button',{name:'选择蓝色',exact:true}).click();await recipient.page.getByRole('button',{name:'确认出牌',exact:true}).click();
  await recipient.page.waitForFunction(id=>!document.querySelector(`[data-hand-slot="${id}"]`),wilds[2].id);assert.equal((await get(live)).game.pending.amount,8);
  checks[`${transport}NormalWildStackAfterArmedPending`]='passed';await recipient.context.close();await observer.context.close();
 }
 for(const kind of ['noStack','target2','all2','lastCard','jumpMismatch','offTurn']){
  const g=state();let card=find('blue','draw2',true),pattern;
  g.pending={amount:2,kind:'draw2',source:0,target:1,challenge:false};
  if(kind==='noStack'){g.stacking=false;pattern=/未开启加牌叠加/}
  if(['target2','all2'].includes(kind)){card=find('wild',kind,true);pattern=/只有数值加牌能叠加/}
  if(kind==='lastCard'){g.out=0;g.players[0].hand=[];pattern=/最后一张.*结算罚牌/}
  if(kind==='jumpMismatch'){g.pending=null;g.turn=2;g.discard=[find('blue','draw2')];pattern=/强化和能量标记全部一致/}
  if(kind==='offTurn'){g.pending=null;g.turn=2;g.jumpIn=false;pattern=/还没轮到你/}
  g.players[1].hand.unshift(card);const room=await create(g),{page,context}=await pageFor(room);
  await assertReason(page,room,card,pattern);const rejected=await submit(room,1,{type:'play',id:card.id,color:'red'});assert.equal(rejected.status,400);assert.match(rejected.data.error,pattern);
  checks[`touchAndServerReason_${kind}`]='passed';await context.close();
 }
 for(const viewport of [{width:320,height:640},{width:844,height:390}]){
  const g=state(),card=find('blue','draw2',true);g.discard=[find('wild','wild4',true)];g.pending={amount:4,kind:'wild4',source:0,target:1,challenge:false};g.players[1].hand.unshift(card);
  const room=await create(g),{page,context}=await pageFor(room,1,false,viewport);
  await assertReason(page,room,card,/上一张印刷加牌值为 \+4/);await page.screenshot({path:`outputs/flex-qa/refusal-${viewport.width}x${viewport.height}.png`});
  checks[`reasonVisible_${viewport.width}x${viewport.height}`]='passed';await context.close();
 }
 const raceGame=state();raceGame.players[1].hand.unshift(find('red','draw2'));
 const race=await create(raceGame),revision=(await get(race)).revision,action={type:'play',id:find('red','draw2').id};
 const responses=await Promise.all([submit(race,1,action,revision),submit(race,1,action,revision)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);checks.concurrentVersionConflict='passed';
 assert.deepEqual(errors,[]);
 const report={testedAt:new Date().toISOString(),runtime:'Node + SQLite; isolated generated test rooms',browser:'Chrome headless, four independent seat credentials; CDP touch for cards and refusal reasons, mouse click for wild color confirmation; no physical phones',checks};
 await writeFile('outputs/flex-qa/results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();db.close()}
