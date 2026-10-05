import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {newGame,viewGame,applyAction} from '../lib/game.ts';
const {chromium}=await import(process.env.UNO_PLAYWRIGHT_MODULE??'playwright');
const base=process.env.UNO_TEST_URL??'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,...(process.env.UNO_CHROME_PATH?{executablePath:process.env.UNO_CHROME_PATH}:{})});
const checks={},errors=[];
await mkdir('outputs/effects-qa',{recursive:true});
async function fixture(viewer=0,prefs={},viewport={width:390,height:844}){
 const context=await browser.newContext({viewport}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 const g=newGame('classic',['甲','乙','丙','丁'].map((name,avatar)=>({name,avatar})),{dealer:3});
 Object.assign(g,{turn:0,color:'red',phase:'playing',pending:null,events:[],eventId:0});
 const room={code:'FXQ222',mode:'classic',playMode:'online',host:0,viewer,revision:1,stacking:true,match500:false,jumpIn:true,finishMode:'first',seats:g.players.map(p=>({name:p.name,avatar:p.avatar,ready:true,virtual:false,online:true})),game:viewGame(g,viewer)};
 let stream;
 await page.routeWebSocket('**/api/room/socket?*',ws=>{stream=ws;ws.onMessage(raw=>{if(JSON.parse(raw).type==='subscribe')ws.send(JSON.stringify({type:'room',room}))})});
 await page.route('**/api/room?*',route=>route.fulfill({json:room}));
 await page.addInitScript(prefs=>{localStorage.setItem('uno-room-FXQ222',JSON.stringify({token:'visual-fixture'}));localStorage.setItem('uno-prefs',JSON.stringify({effects:true,...prefs}))},prefs);
 await page.goto(base+'/?room='+room.code);await page.locator('.hand-fan').waitFor();await page.waitForTimeout(150);
 return {context,page,g,room,push(){g.revision++;room.revision++;room.game=viewGame(g,viewer);stream.send(JSON.stringify({type:'room',room}))}};
}
try{
 const defaults=await fixture();await defaults.page.getByRole('button',{name:'设置',exact:true}).click();
 assert.equal(await defaults.page.getByRole('switch',{name:'出牌人物卡片',exact:true}).getAttribute('aria-checked'),'false');
 await defaults.page.keyboard.press('Escape');defaults.g.events=[{id:1,type:'play',actor:0,cameo:1,text:'甲 出牌'}];defaults.push();await defaults.page.waitForTimeout(180);
 assert.equal(await defaults.page.locator('.cameo-burst').count(),0);checks.defaultCameoDisabled='passed';await defaults.context.close();
 const explicit=await fixture(0,{showCameo:true});explicit.g.events=[{id:1,type:'play',actor:0,cameo:1,text:'甲 出牌'}];explicit.push();await explicit.page.locator('.cameo-burst').waitFor();checks.explicitCameoPreferencePreserved='passed';await explicit.context.close();
 for(const type of ['stack','skip']){
  const f=await fixture();f.g.events=[{id:1,type,actor:0,target:1,amount:4,text:'乙 接招'}];f.push();
  const effect=f.page.locator(`.seat-1 .seat-effect-${type}`);await effect.waitFor();const visual=f.page.locator(`.seat-1 .seat-impact-visual[data-event-type="${type}"]`);assert.ok(await visual.locator('.seat-fx-ring').count());assert.ok(await visual.locator('.seat-fx-particle').count());assert.ok(await visual.locator('.seat-fx-icon').count());
  assert.equal(await f.page.locator(`.seat-0 .seat-effect-${type}`).count(),0);
  if(type==='skip')assert.equal(await f.page.locator('.screen-fx.fx-skip').count(),0);
  await f.page.waitForTimeout(250);await f.page.screenshot({path:`outputs/effects-qa/seat-${type}.png`});checks[`${type}HasTargetedGraphicImpact`]='passed';await f.context.close();
 }
 const color=await fixture();color.g.color='blue';color.g.events=[{id:1,type:'color',actor:0,color:'blue',text:'甲 选择蓝色'}];color.push();await color.page.locator('.screen-fx.fx-color').waitFor();
 assert.equal((await color.page.locator('.screen-fx.fx-color').textContent()).trim(),'');await color.page.screenshot({path:'outputs/effects-qa/color-wave.png'});checks.colorUsesVisualWithoutCaption='passed';await color.context.close();
 const turn=await fixture();await turn.page.locator('.table-your-turn.table-color-red').waitFor();
 turn.g.turn=1;turn.push();await turn.page.locator('.table-waiting.table-color-red').waitFor();
 await turn.page.locator('.seat-2 .next-seat-label').waitFor();
 turn.g.dir=-1;turn.g.finishMode='ranking';turn.g.rankings=[0];turn.g.players[0].hand=[];turn.push();
 await turn.page.locator('.seat-3 .next-seat-label').waitFor();
 const direction=await turn.page.locator('.table-state').textContent();assert.ok(direction.includes('逆时针'));
 await turn.page.screenshot({path:'outputs/effects-qa/waiting-counterclockwise.png'});checks.turnBrightnessAndNextActivePlayer='passed';await turn.context.close();
 for(const viewer of [0,1]){
  const f=await fixture(viewer);f.g.finishMode='ranking';f.g.rankings=[1];f.g.players[1].hand=[];f.g.turn=2;f.g.events=[{id:1,type:'finish',actor:1,target:1,rank:1,text:'乙 第 1 名出完手牌'}];f.push();
  const seat=f.page.locator('.seat-1 .seat-effect-finish');await seat.waitFor();assert.ok((await seat.textContent()).includes('VICTORY'));assert.ok((await seat.textContent()).includes('1'));
  await f.page.getByText('乙 第 1 名出完手牌',{exact:true}).first().waitFor();
  if(viewer===1){await f.page.locator('.screen-fx.fx-finish').waitFor();assert.ok((await f.page.locator('.screen-fx.fx-finish').textContent()).includes('VICTORY'))}
  else assert.equal(await f.page.locator('.screen-fx.fx-finish').count(),0);
  await f.page.screenshot({path:`outputs/effects-qa/finish-viewer-${viewer}.png`});checks[`rankingFinishForViewer${viewer}`]='passed';await f.context.close();
 }
 const victory=await fixture(0,{effects:false});victory.g.finishMode='ranking';victory.g.rankings=[1];victory.g.players[1].hand=[];victory.g.turn=2;victory.push();
 await victory.page.locator('.seat-1.victorious-seat .seat-finish-status').waitFor();assert.match(await victory.page.locator('.seat-1 .seat-finish-status').textContent(),/VICTORY.*1/);
 await victory.page.waitForTimeout(2350);assert.match(await victory.page.locator('.seat-1 .seat-finish-status').textContent(),/VICTORY.*1/);
 victory.g.rankings=[1,2,0,3];victory.g.players[2].hand=[];victory.g.players[0].hand=[];victory.g.phase='over';victory.g.winner=1;victory.g.matchWinner=1;victory.push();
 await victory.page.locator('.seat-3 .seat-rank').filter({hasText:'4'}).waitFor();assert.equal(await victory.page.locator('.seat-3.victorious-seat').count(),0);checks.persistentVictoryRanksWithEffectsDisabled='passed';await victory.context.close();
 for(const viewport of [{width:320,height:640},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]){
  const aligned=await fixture(0,{},viewport);aligned.g.players[1].name='昵称很长的获胜玩家乙';aligned.room.seats[1].name=aligned.g.players[1].name;aligned.g.events=[{id:1,type:'skip',target:1,actor:0,text:'乙 被跳过'}];aligned.push();
  await aligned.page.locator('.seat-1 .seat-impact-visual .seat-fx-icon').waitFor();await aligned.page.waitForTimeout(200);
  const centers=await aligned.page.locator('.seat-1').evaluate(seat=>{
   const center=el=>{const box=el.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2}};
   return {seat:center(seat),ring:center(seat.querySelector('.seat-fx-ring')),icon:center(seat.querySelector('.seat-fx-icon'))};
  });
  for(const element of [centers.ring,centers.icon])assert.ok(Math.hypot(element.x-centers.seat.x,element.y-centers.seat.y)<1.5,JSON.stringify({viewport,centers}));
  await aligned.page.screenshot({path:`outputs/effects-qa/aligned-${viewport.width}x${viewport.height}.png`});checks[`seatGraphicsAligned${viewport.width}x${viewport.height}`]='passed';await aligned.context.close();
  const bottom=await fixture(0,{},viewport);bottom.g.finishMode='ranking';bottom.g.rankings=[3];bottom.g.players[3].hand=[];bottom.g.turn=1;bottom.g.events=[{id:1,type:'finish',target:3,actor:3,rank:1,text:'丁 第 1 名出完手牌'}];bottom.push();
  await bottom.page.locator('.seat-3 .seat-impact-visual .seat-fx-icon').waitFor();await bottom.page.waitForTimeout(200);
  const bottomCenters=await bottom.page.locator('.seat-3').evaluate(seat=>{
   const center=el=>{const box=el.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2}};
   return {seat:center(seat),ring:center(seat.querySelector('.seat-fx-ring')),icon:center(seat.querySelector('.seat-fx-icon'))};
  });
  for(const element of [bottomCenters.ring,bottomCenters.icon])assert.ok(Math.hypot(element.x-bottomCenters.seat.x,element.y-bottomCenters.seat.y)<1.5,JSON.stringify({viewport,bottomCenters}));
  await bottom.page.screenshot({path:`outputs/effects-qa/aligned-finish-${viewport.width}x${viewport.height}.png`});checks[`finishedBottomSeatGraphicsAligned${viewport.width}x${viewport.height}`]='passed';await bottom.context.close();
 }
 for(const viewer of [0,2]){
  const reverse=await fixture(viewer);reverse.g.finishMode='ranking';reverse.g.rankings=[1,3];reverse.g.players[1].hand=[];reverse.g.players[3].hand=[];reverse.g.players[0].hand=[{id:'two-reverse',a:{color:'red',kind:'reverse'}},{id:'held-a',a:{color:'red',kind:'number',n:7}},{id:'held-b',a:{color:'blue',kind:'number',n:3}}];reverse.push();
  if(viewer===0){
   await reverse.page.route('**/api/room',async route=>{const request=route.request().postDataJSON();Object.assign(reverse.g,applyAction(reverse.g,0,request.action));reverse.push();await route.fulfill({json:reverse.room})});
   const card=reverse.page.locator('[data-hand-slot="two-reverse"] button');await card.waitFor();await card.click();await reverse.page.locator('#hand-card-effect').filter({hasText:'仅剩两人，跳过对手，由你继续出牌'}).waitFor();await card.click();
  }else{Object.assign(reverse.g,applyAction(reverse.g,0,{type:'play',id:'two-reverse'}));reverse.push()}
  await reverse.page.locator('.seat-2 .seat-effect-skip').waitFor();assert.equal(reverse.g.turn,0);assert.equal(await reverse.page.locator('.screen-fx.fx-reverse').count(),0);
  if(viewer===0){await reverse.page.locator('.table-your-turn').waitFor();assert.equal(await reverse.page.locator('.screen-fx.fx-skip').count(),0)}
  else await reverse.page.locator('.screen-fx.fx-skip').waitFor();
  checks[`twoPlayerReverseActsAndAnimatesAsSkipViewer${viewer}`]='passed';await reverse.context.close();
 }
 const uno=await fixture(1);uno.g.events=[{id:1,type:'uno',actor:0,text:'甲：UNO！'},{id:2,type:'skip',actor:0,target:1,text:'乙 被跳过'}];uno.push();
 await uno.page.locator('.screen-fx.fx-uno').waitFor();assert.equal(await uno.page.locator('.seat-effect-skip').count(),0);
 await uno.page.locator('.screen-fx.fx-skip').waitFor();await uno.page.locator('.seat-1 .seat-effect-skip').waitFor();assert.equal(await uno.page.locator('.screen-fx.fx-uno').count(),0);checks.unoDisplaysBeforeCardEffect='passed';await uno.context.close();
 assert.deepEqual(errors,[]);
 const report={testedAt:new Date().toISOString(),browser:'Chromium; controlled authenticated stream projections for effect ordering',checks};
 await writeFile('qa-table-effects.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}
