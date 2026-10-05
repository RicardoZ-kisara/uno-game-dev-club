import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {newGame,viewGame} from '../lib/game.ts';
const {chromium}=await import(process.env.UNO_PLAYWRIGHT_MODULE??'playwright');
const base=process.env.UNO_TEST_URL??'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,...(process.env.UNO_CHROME_PATH?{executablePath:process.env.UNO_CHROME_PATH}:{})}),checks={},errors=[];
async function fixture(viewport,side=0){
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:viewport.width<1000}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const g=newGame('flip',['甲','乙','丙','丁'].map((name,avatar)=>({name,avatar})));g.turn=0;g.side=side;g.phase='playing';g.color=side?'teal':'red';g.pending=null;g.discard=[{id:'fixture-top',a:{color:'red',kind:'number',n:1},b:{color:'teal',kind:'number',n:1}}];
 g.players[0].hand=Array.from({length:4},(_,i)=>({id:`pair-${i}`,a:{color:'red',kind:'number',n:i+2},b:{color:'teal',kind:'number',n:i+6}}));
 const room={code:'FLIP22',mode:'flip',playMode:'online',host:0,viewer:0,revision:1,stacking:false,match500:false,jumpIn:false,finishMode:'first',seats:g.players.map(p=>({name:p.name,avatar:p.avatar,ready:true,virtual:false,online:true})),game:viewGame(g,0)};
 let posts=0;await page.routeWebSocket('**/api/room/socket?*',ws=>ws.onMessage(raw=>{if(JSON.parse(raw).type==='subscribe')ws.send(JSON.stringify({type:'room',room}));else ws.send(JSON.stringify({type:'pong'}))}));
 await page.route('**/api/room?*',route=>route.fulfill({json:room}));await page.route('**/api/room',route=>{posts++;return route.fulfill({json:room})});
 await page.addInitScript(()=>{localStorage.setItem('uno-room-FLIP22',JSON.stringify({token:'fixture'}));localStorage.setItem('uno-prefs',JSON.stringify({effects:false,touchTapToPlay:true}))});
 await page.goto(base+'/flip?room=FLIP22');await page.locator('[data-hand-slot="pair-3"] button').waitFor();return {context,page,get posts(){return posts}};
}
async function touch(page,moves=[]){const cdp=await page.context().newCDPSession(page),r=await page.locator('[data-hand-slot="pair-3"]').boundingBox(),p={x:r.x+r.width/2,y:r.y+55};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});for(const [x,y] of moves)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+x,y:p.y+y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach()}
try{
 await mkdir('outputs/mobile-qa',{recursive:true});
 for(const side of [0,1]){
  const f=await fixture({width:390,height:844},side),p=f.page,card=p.locator('[data-hand-slot="pair-3"] button');await card.click();
  await p.evaluate(()=>{window.fixtureSlots=[...document.querySelectorAll('[data-hand-slot]')];window.fixtureIds=window.fixtureSlots.map(el=>el.dataset.handSlot)});
  await p.getByRole('button',{name:'查看自己的另一面',exact:true}).click();await p.locator('.hand-fan.inspecting-other').waitFor();
  assert.equal(await p.getByRole('dialog').count(),0,'inspection is in-place, without a modal');
  assert.equal(await p.locator('.hand-fan').getAttribute('data-hand-side'),String(1-side));assert.equal(await p.locator('.hand-slot .playable').count(),0);assert.equal(await p.locator('[data-hand-slot="pair-3"]').evaluate(el=>el.classList.contains('is-selected')),true);
  assert.equal(await p.evaluate(()=>{const now=[...document.querySelectorAll('[data-hand-slot]')];return now.every((el,i)=>el===window.fixtureSlots[i]&&el.dataset.handSlot===window.fixtureIds[i])}),true,'same DOM slots and card order');
  assert.ok((await card.getAttribute('aria-label')).includes(side?'红':'青'));await p.locator('#hand-card-effect').filter({hasText:'明暗面一一对应'}).waitFor();
  await p.waitForTimeout(450);await p.screenshot({path:`outputs/mobile-qa/flip-inspect-side-${side}.png`});
  await card.click({force:true});await card.click({force:true});await card.focus();await p.keyboard.press('Enter');await p.keyboard.press('Space');await touch(p);await touch(p,[[0,-30],[0,-80]]);await p.waitForTimeout(120);assert.equal(f.posts,0,'inspection blocks mouse, keyboard and touch play');
  await p.getByRole('button',{name:'返回当前出牌面',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.hand-fan')?.classList.contains('inspecting-other'));assert.equal(await card.getAttribute('data-displayed-side'),String(side));assert.ok((await card.getAttribute('aria-label')).includes(side?'青':'红'));assert.ok(await p.locator('.hand-slot .playable').count());
  await card.focus();await p.keyboard.press('Enter');await p.waitForTimeout(150);assert.equal(f.posts,1,'returning to active side restores play');checks[`inPlaceInspectionSide${side}`]='passed';await f.context.close();
 }
 for(const viewport of [{width:844,height:390},{width:667,height:320},{width:1024,height:600}]){
  const f=await fixture(viewport),p=f.page;
  const geometry=await p.evaluate(()=>{const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}},piles=box(document.querySelector('.piles'));return [...document.querySelectorAll('.opponent-backs')].map(el=>{const rel=el.className.match(/backs-(\d)/)[1];return {rel:Number(rel),back:box(el),seat:box(document.querySelector('.seat.relative-'+rel)),piles,previews:[...el.querySelectorAll('.playing-card')].filter(c=>getComputedStyle(c).display!=='none').length}})});
  for(const {rel,back,seat,piles,previews} of geometry){assert.ok(rel===1?back.left>=seat.right:back.right<=seat.left,JSON.stringify({viewport,rel,back,seat}));assert.ok(Math.abs(back.top-seat.top)<4,'backs must be beside the seat');assert.ok(back.right<=viewport.width&&back.left>=0);assert.ok(back.right<=piles.left||back.left>=piles.right||back.bottom<=piles.top||back.top>=piles.bottom,'backs must not cover the piles');assert.ok(previews>0&&previews<=3)}
  await p.screenshot({path:`outputs/mobile-qa/flip-landscape-${viewport.width}x${viewport.height}.png`});
  await p.locator('.opponent-backs').first().click();await p.getByRole('dialog').waitFor();assert.ok(await p.locator('.opponent-detail-cards .playing-card').count());checks[`landscape${viewport.width}x${viewport.height}`]='passed';await f.context.close();
 }
 assert.deepEqual(errors,[]);await mkdir('outputs/mobile-qa',{recursive:true});const report=JSON.stringify({testedAt:new Date().toISOString(),browser:'Chromium CDP touch simulation; physical phones not tested',checks},null,2)+'\n';await writeFile('outputs/mobile-qa/flip-hand-results.json',report);await writeFile('qa-flip-hand.json',report);console.log(JSON.stringify(checks,null,2));
}finally{await browser.close()}
