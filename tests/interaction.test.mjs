import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {newGame,viewGame} from '../lib/game.ts';
const {chromium}=await import(process.env.UNO_PLAYWRIGHT_MODULE??'playwright');
const base=process.env.UNO_TEST_URL??'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,...(process.env.UNO_CHROME_PATH?{executablePath:process.env.UNO_CHROME_PATH}:{})});
const checks={};
const errors=[];
await mkdir('outputs/mobile-qa',{recursive:true});
async function create(mode='classic'){
 for(let attempt=0;attempt<20;attempt++){
  const r=await fetch(base+'/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'create',mode,name:'触屏测试',playMode:'shared'})});
  const room=await r.json();assert.equal(r.status,200,JSON.stringify(room));
  if(room.game.legal.some(l=>l.normal&&room.game.players[room.game.turn].hand.find(c=>c.id===l.id)?.a.color!=='wild'))return room;
 }
 throw Error('Could not create a room with a non-wild playable card');
}
async function fixture(viewport={width:390,height:844},mode='classic',prefs={}){
 const room=await create(mode),context=await browser.newContext({viewport,hasTouch:true,isMobile:true});
 const page=await context.newPage(),sockets=[];page.on('pageerror',e=>errors.push(e.message));page.on('websocket',ws=>sockets.push(ws));
 await page.addInitScript(({room,prefs})=>{
  if(!localStorage.getItem(`uno-room-${room.code}`))localStorage.setItem(`uno-room-${room.code}`,JSON.stringify({token:room.token}));
  if(!localStorage.getItem('uno-prefs'))localStorage.setItem('uno-prefs',JSON.stringify({effects:false,...prefs}));
 },{room,prefs});
 await page.goto(`${base}${mode==='classic'?'/':'/'+mode}?room=${room.code}`);
 await page.getByRole('button',{name:'我已接手，查看手牌'}).click();
 await page.locator('.hand-slot .playable').first().waitFor();
 const cdp=await context.newCDPSession(page);
 return {room,context,page,cdp,sockets};
}
async function point(page){
 const id=await page.locator('.hand-slot .playable:not(.color-wild)').last().evaluate(el=>el.parentElement.dataset.handSlot);
 const point=await page.locator(`[data-hand-slot="${id}"]`).evaluate(el=>{
  const r=el.getBoundingClientRect(),next=el.nextElementSibling?.getBoundingClientRect();
  return {x:r.left+Math.min(25,next?Math.max(3,(next.left-r.left)/2):r.width/2),y:r.top+70};
 });return {...point,id};
}
async function touch(cdp,p,moves=[],cancel=false){
 const event=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await event('touchStart',[{x:p.x,y:p.y}]);
 for(const [dx,dy] of moves)await event('touchMove',[{x:p.x+dx,y:p.y+dy}]);
 await event(cancel?'touchCancel':'touchEnd',[]);
}
async function state(room){return fetch(base+'/api/room?code='+room.code,{headers:{Authorization:'Bearer '+room.token}}).then(r=>r.json())}
async function played(page,room){await page.waitForFunction(async({base,code,token,revision})=>{const r=await fetch(`${base}/api/room?code=${code}`,{headers:{Authorization:`Bearer ${token}`}});return (await r.json()).game.revision>revision},{base,code:room.code,token:room.token,revision:room.game.revision})}
try{
 for(const kind of ['directSwipe','tapThenSwipe','doubleTapDisabled','doubleTapEnabled','horizontalBrowse','cancelledSwipe']){
  const {page,room,context,cdp}=await fixture(undefined,'classic',{touchTapToPlay:kind==='doubleTapEnabled'});
  const p=await point(page);
  if(kind==='tapThenSwipe'||kind.startsWith('doubleTap'))await touch(cdp,p);
  if(kind==='directSwipe'||kind==='tapThenSwipe')await touch(cdp,p,[[0,-20],[0,-80]]);
  else if(kind.startsWith('doubleTap'))await touch(cdp,p);
  else if(kind==='horizontalBrowse')await touch(cdp,p,[[40,0],[65,-80]]);
  else await touch(cdp,p,[[0,-80]],true);
  if(['directSwipe','tapThenSwipe','doubleTapEnabled'].includes(kind))await played(page,room);
  else assert.equal((await state(room)).game.revision,room.game.revision,kind);
  checks[kind]='passed';await context.close();
 }
 for(const kind of ['mouseSecondClick','keyboardAfterTouch']){
  const {page,room,context,cdp}=await fixture();const p=await point(page);
  if(kind==='mouseSecondClick'){
   await page.mouse.click(p.x,p.y);assert.equal((await state(room)).game.revision,room.game.revision);
   await page.mouse.click(p.x,p.y);
  }else{
   await touch(cdp,p);await page.locator(`[data-hand-slot="${p.id}"] button`).focus();await page.keyboard.press('Enter');
  }
  await played(page,room);checks[kind]='passed';await context.close();
 }
 const {page,room,context}=await fixture();
 await page.getByRole('button',{name:'设置',exact:true}).click();
 const tap=page.getByRole('switch',{name:'手机二次点击出牌',exact:true}),shine=page.getByRole('switch',{name:'卡片高光',exact:true});
 const cameo=page.getByRole('switch',{name:'出牌人物卡片',exact:true});assert.equal(await cameo.getAttribute('aria-checked'),'false');
 assert.equal(await shine.getAttribute('aria-checked'),'false');
 const off=await shine.evaluate(el=>getComputedStyle(el).backgroundColor);await shine.click();
 await page.waitForFunction(off=>{const el=document.querySelector('[aria-label="卡片高光"]');return el?.getAttribute('aria-checked')==='true'&&getComputedStyle(el).backgroundColor!==off},off);await tap.click();
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-slot=switch]')].every(el=>{const r=el.getBoundingClientRect(),t=el.querySelector('[data-slot=switch-thumb]').getBoundingClientRect();return t.left>=r.left&&t.right<=r.right}));
 await page.screenshot({path:'outputs/mobile-qa/settings.png'});
 await page.reload();await page.getByRole('button',{name:'我已接手，查看手牌'}).click();await page.getByRole('button',{name:'设置',exact:true}).click();
 assert.equal(await shine.getAttribute('aria-checked'),'true');assert.equal(await tap.getAttribute('aria-checked'),'true');assert.equal(await cameo.getAttribute('aria-checked'),'false');checks.preferencePersistenceAndSwitchContrast='passed';
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'离开牌桌',exact:true}).click();await page.getByRole('button',{name:'离开牌桌',exact:true}).click();
 await page.getByRole('button',{name:`返回牌桌 ${room.code}`}).waitFor();await page.reload();await page.getByRole('button',{name:`返回牌桌 ${room.code}`}).click();
 await page.getByRole('button',{name:'我已接手，查看手牌'}).waitFor();assert.equal((await state(room)).game.revision,room.game.revision);checks.leaveReloadAndResume='passed';await context.close();
 for(const mode of ['classic','flip','flex'])for(const viewport of [{width:320,height:640},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]){
  const {page,context}=await fixture(viewport,mode);
  const geometry=await page.evaluate(()=>{
   const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
   return {seats:[...document.querySelectorAll('.table-stage .seat')].map(box),piles:box(document.querySelector('.piles')),stage:box(document.querySelector('.table-stage')),fan:box(document.querySelector('.hand-fan')),cards:[...document.querySelectorAll('[data-hand-slot]')].map(box),scroll:document.documentElement.scrollHeight,screen:innerHeight};
  });
  assert.equal(geometry.seats.length,4);
  await page.screenshot({path:`outputs/mobile-qa/${mode}-${viewport.width}x${viewport.height}.png`});
  for(const seat of geometry.seats){assert.ok(seat.width>0);assert.ok(seat.x>=0&&seat.right<=viewport.width+1);assert.ok(seat.y>=geometry.stage.y-1&&seat.bottom<=geometry.stage.bottom+1,JSON.stringify({mode,viewport,geometry}));assert.ok(seat.right<=geometry.piles.x||seat.x>=geometry.piles.right||seat.bottom<=geometry.piles.y||seat.y>=geometry.piles.bottom,JSON.stringify({mode,viewport,geometry}))}
  const expected=viewport.width>=600&&viewport.height<=460?77.4:viewport.height<=660?86.4:viewport.width<=720?100.8:Math.min(124.2,Math.max(106.2,viewport.width*.09));
  assert.ok(Math.abs(geometry.cards[0].width-expected)<.2,JSON.stringify({mode,viewport,geometry}));
  for(let i=1;i<geometry.cards.length;i++)assert.ok(geometry.cards[i].x-geometry.cards[i-1].x>=(viewport.width<600?31.9:47.9));
  assert.ok(geometry.stage.height>130);assert.ok(geometry.fan.bottom<=viewport.height);assert.equal(geometry.scroll,geometry.screen);
  await page.screenshot({path:`outputs/mobile-qa/${mode}-${viewport.width}x${viewport.height}.png`});checks[`${mode}-${viewport.width}x${viewport.height}`]='passed';await context.close();
 }
 const live=await fixture();assert.ok(live.sockets.some(s=>s.url().includes('/api/room/socket?')));let requests=0;live.page.on('request',r=>{if(r.url().includes('/api/room?'))requests++});
 await new Promise(resolve=>setTimeout(resolve,1600));assert.equal(requests,0);checks.websocketIdleWithoutPolling='passed';
 const before=await state(live.room);const response=await fetch(base+'/api/room',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+live.room.token},body:JSON.stringify({op:'action',code:live.room.code,revision:before.revision,requestId:crypto.randomUUID(),action:{type:'draw'}})});assert.equal(response.status,200,await response.text());
 await live.page.waitForFunction(()=>document.querySelector('.last-action')?.textContent.includes('摸'));checks.websocketPushAcrossClients='passed';
 await live.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});
 await new Promise(resolve=>setTimeout(resolve,300));assert.ok(live.sockets.at(-1).isClosed());
 const socketCount=live.sockets.length;await live.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});
 await live.page.waitForFunction(()=>document.querySelector('.connection-status')?.textContent==='已连接');assert.ok(live.sockets.length>socketCount);checks.backgroundPauseAndForegroundReconnect='passed';await live.context.close();
 const post=async(body,token)=>{const r=await fetch(base+'/api/room',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({...body,...(token?{requestId:crypto.randomUUID()}:{})})});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data};
 let fallbackRoom=await post({op:'create',mode:'classic',name:'退路甲',playMode:'online'}),fallbackCode=fallbackRoom.code;const fallbackTokens=[fallbackRoom.token];
 for(const name of ['退路乙','退路丙','退路丁'])fallbackTokens.push((await post({op:'join',code:fallbackCode,mode:'classic',name})).token);
 for(const token of fallbackTokens)fallbackRoom=await post({op:'ready',code:fallbackCode,ready:true},token);
 fallbackRoom=await post({op:'start',code:fallbackCode,revision:fallbackRoom.revision},fallbackTokens[0]);fallbackRoom.token=fallbackTokens[0];
 const fallbackContext=await browser.newContext({viewport:{width:390,height:844}}),fallbackPage=await fallbackContext.newPage();let fallbackRequests=0;
 fallbackPage.on('request',r=>{if(r.url().includes('/api/room?'))fallbackRequests++});await fallbackPage.routeWebSocket('**/api/room/socket?*',ws=>ws.close());
 await fallbackPage.addInitScript(room=>{localStorage.setItem(`uno-room-${room.code}`,JSON.stringify({token:room.token}));localStorage.setItem('uno-prefs',JSON.stringify({effects:false}))},fallbackRoom);
 await fallbackPage.goto(base+'/?room='+fallbackCode);await fallbackPage.locator('.hand-slot').first().waitFor();const fallbackInitial=fallbackRequests;
 const fallbackState=await state(fallbackRoom),fallbackTurn=fallbackState.game.turn;const fallbackAction=fallbackState.game.pending?{type:'accept'}:fallbackState.game.phase==='color'?{type:'color',color:'red'}:{type:'draw'};
 await post({op:'action',code:fallbackCode,revision:fallbackState.revision,action:fallbackAction},fallbackTokens[fallbackTurn]);
 await fallbackPage.waitForFunction(()=>document.querySelector('.last-action')?.textContent.match(/摸|惩罚|变为/));
 assert.ok(fallbackRequests>fallbackInitial);assert.ok(await fallbackPage.locator('.hand-slot').count());assert.ok((await fallbackPage.locator('.hand-owner').textContent()).includes('退路甲'));checks.websocketUnavailableFallsBackToOwnHandHttpSync='passed';await fallbackContext.close();
 const flip=await fixture(undefined,'flip');const flipIds=await flip.page.locator('[data-hand-slot]').evaluateAll(els=>els.map(el=>el.dataset.handSlot));await flip.page.getByRole('button',{name:'查看自己的另一面'}).click();
 await flip.page.locator('.hand-fan.inspecting-other').waitFor();assert.deepEqual(await flip.page.locator('[data-hand-slot]').evaluateAll(els=>els.map(el=>el.dataset.handSlot)),flipIds);assert.equal(await flip.page.locator('.hand-slot .playable').count(),0);assert.equal(await flip.page.locator('[role="dialog"]').count(),0);checks.ownFlipOtherSide='passed';await flip.context.close();
 const lift=await fixture();const liftPoint=await point(lift.page);await lift.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:liftPoint.x,y:liftPoint.y}]});
 await lift.page.waitForFunction(id=>getComputedStyle(document.querySelector(`[data-hand-slot="${id}"] button`)).transform==='matrix(1, 0, 0, 1, 0, -30)',liftPoint.id);checks.touchLiftEqualsSelectedHeight='passed';await lift.context.close();
 // Controlled stream snapshots isolate who receives each animation and result.
 async function projected(viewer=0,mode='classic'){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();
  const g=newGame(mode,['甲','乙','丙','丁'].map((name,avatar)=>({name,avatar})),{dealer:3});g.turn=0;g.color='red';g.pending=null;g.events=[];g.eventId=0;
  const room={code:'UIFX22',mode,playMode:'online',host:0,viewer,revision:1,stacking:false,match500:false,jumpIn:false,finishMode:'first',seats:g.players.map(p=>({name:p.name,avatar:p.avatar,ready:true,virtual:false,online:true})),game:viewGame(g,viewer)};
  let stream;await page.routeWebSocket('**/api/room/socket?*',ws=>{stream=ws;ws.onMessage(raw=>{if(JSON.parse(raw).type==='subscribe')ws.send(JSON.stringify({type:'room',room}))})});
  await page.route('**/api/room?*',route=>route.fulfill({json:room}));await page.addInitScript(()=>{localStorage.setItem('uno-room-UIFX22',JSON.stringify({token:'ui-fixture'}));localStorage.setItem('uno-prefs',JSON.stringify({effects:true,showCameo:false}))});
  await page.goto(base+(mode==='classic'?'/':'/'+mode)+'?room=UIFX22');await page.locator('.hand-fan').waitFor();await page.waitForTimeout(150);
  return {context,page,g,room,push:()=>stream.send(JSON.stringify({type:'room',room}))};
 }
 for(const viewer of [0,1]){
  const f=await projected(viewer);f.g.events=[{id:1,type:'damage',actor:0,target:1,amount:6,text:'乙 受到惩罚，摸 6 张'}];f.g.eventId=1;f.g.revision=2;f.room.revision=2;f.room.game=viewGame(f.g,viewer);f.push();
  await f.page.locator('.seat-1 .seat-effect-damage').waitFor();await f.page.getByText('乙 受到惩罚，摸 6 张',{exact:true}).first().waitFor();
  if(viewer===1){await f.page.locator('.screen-fx.fx-damage').waitFor();await f.page.locator('.fx-recipient').filter({hasText:'乙 摸 6 张'}).waitFor()}
  else{await f.page.waitForTimeout(200);assert.equal(await f.page.locator('.screen-fx.fx-damage').count(),0)}
  checks[`targetedDamageViewer${viewer}`]='passed';await f.context.close();
 }
 for(const viewer of [0,1]){
  const f=await projected(viewer);f.g.winner=0;f.g.matchWinner=0;f.g.phase='over';f.g.roundPoints=[0,12,20,30];f.g.revision=2;f.room.revision=2;f.room.game=viewGame(f.g,viewer);f.push();
  await f.page.locator('.victory-panel>span').filter({hasText:viewer===0?'VICTORY':'LOSE'}).waitFor();assert.ok((await f.page.locator('.round-result').textContent()).includes(viewer===0?'62':'12'));checks[`individualResultViewer${viewer}`]='passed';await f.context.close();
 }
 const ranking=await projected();ranking.g.finishMode='ranking';ranking.g.rankings=[2,0,3,1];ranking.g.winner=2;ranking.g.matchWinner=2;ranking.g.phase='over';ranking.g.revision=2;ranking.room.revision=2;ranking.room.game=viewGame(ranking.g,0);ranking.push();
 await ranking.page.locator('.ranking-board').waitFor();assert.deepEqual(await ranking.page.locator('.ranking-board>div b').allTextContents(),['丙','甲','丁','乙']);checks.rankingOrder='passed';await ranking.context.close();
 const target=await projected(0,'flex');target.g.finishMode='ranking';target.g.rankings=[2];target.g.players[2].hand=[];target.g.players[0].hand=[{id:'fixture-target',a:{color:'wild',kind:'target2',flex:'target2'}},{id:'fixture-held',a:{color:'blue',kind:'number',n:2}}];target.g.revision=2;target.room.revision=2;target.room.game=viewGame(target.g,0);target.push();
 await target.page.locator('[data-hand-slot="fixture-target"]').waitFor();await target.page.getByRole('button',{name:'FLEX 强化',exact:true}).click();await target.page.locator('[data-hand-slot="fixture-target"] button').click();await target.page.locator('[data-hand-slot="fixture-target"] button').click();await target.page.locator('.target-picker').waitFor();assert.deepEqual(await target.page.locator('.target-picker button').allTextContents(),['02乙','04丁']);checks.finishedPlayerExcludedFromTargetPicker='passed';await target.context.close();
 const long=await projected();long.g.players[0].hand=Array.from({length:45},(_,i)=>({...long.g.players[0].hand[i%7],id:`long-${i}`}));long.g.revision=2;long.room.revision=2;long.room.game=viewGame(long.g,0);long.push();
 await long.page.locator('[data-hand-slot="long-0"]').waitFor();assert.ok(await long.page.locator('.hand-pages').count());const exposure=await long.page.locator('[data-hand-slot]').evaluateAll(els=>els.slice(1).map((el,i)=>el.getBoundingClientRect().left-els[i].getBoundingClientRect().left));assert.ok(exposure.every(n=>n>=31.9));await long.page.getByRole('button',{name:'下一组手牌'}).click();assert.equal(await long.page.locator('[data-hand-slot="long-0"]').count(),0);checks.longHandPaginationPreservesSpacing='passed';await long.context.close();
 const skip=await projected();skip.g.events=[{id:1,type:'skip',actor:0,target:1,text:'乙 被跳过'},{id:2,type:'color',actor:0,color:'blue',text:'变为蓝色'}];skip.g.eventId=2;skip.g.revision=2;skip.g.color='blue';skip.room.revision=2;skip.room.game=viewGame(skip.g,0);skip.push();
 await skip.page.locator('.seat-1 .seat-effect-skip').waitFor();await skip.page.locator('.table-color-blue').waitFor();await skip.page.locator('.screen-fx.fx-color').waitFor();assert.equal(await skip.page.locator('.screen-fx.fx-skip').count(),0);checks.targetedSkipAndWildColor='passed';await skip.context.close();
 const presence=await projected();presence.room.seats[0].online=false;presence.push();await presence.page.locator('.seat-0 .seat-presence').filter({hasText:'离线'}).waitFor();await presence.page.getByRole('button',{name:'跳过离线玩家'}).waitFor();checks.equalRevisionPresenceAndHostSkip='passed';await presence.context.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify(checks,null,2));
 const report={testedAt:new Date().toISOString(),browser:'Chromium with CDP touch input; physical phones not tested',viewports:[[320,640],[390,844],[844,390],[1440,900]],touchLiftPixels:30,mouseHoverLiftPixels:30,phoneCardWidthPixels:100.8,shortPhoneCardWidthPixels:86.4,landscapeCardWidthPixels:77.4,desktopMaxCardWidthPixels:124.2,minimumExposedPixels:{phone:32,desktop:48},checks,networkReports:['qa-network.json','qa-network-node.json']};
 await writeFile('outputs/mobile-qa/results.json',JSON.stringify(report,null,2));await writeFile('qa-interaction.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close()}
