import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.env.UNO_TEST_URL??'http://127.0.0.1:5173';
const results=[];
async function call(body,token){const r=await fetch(base+'/api/room',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
async function get(code,token){const r=await fetch(base+'/api/room?code='+code,{headers:token?{Authorization:'Bearer '+token}:{}});return {status:r.status,data:await r.json()}}
for(const mode of ['classic','flip','flex']){
 const created=await call({op:'create',mode,name:'测试1',stacking:true});assert.equal(created.status,200,JSON.stringify(created.data));const code=created.data.code;const tokens=[created.data.token];
 for(let i=1;i<4;i++){const r=await call({op:'join',code,mode,name:'测试'+(i+1)});assert.equal(r.status,200,JSON.stringify(r.data));tokens.push(r.data.token)}
 assert.equal((await call({op:'join',code,mode,name:'第五人'})).status,409);
 assert.equal((await get(code)).status,401);
 const stale=await call({op:'ready',code,revision:1,requestId:crypto.randomUUID()},tokens[0]);assert.equal(stale.status,409);
 for(let i=0;i<4;i++){const r=await get(code,tokens[i]);assert.equal(r.data.viewer,i);const ready=await call({op:'ready',code,revision:r.data.revision,requestId:crypto.randomUUID()},tokens[i]);assert.equal(ready.status,200)}
 let r=await get(code,tokens[1]);assert.equal((await call({op:'start',code,revision:r.data.revision,requestId:crypto.randomUUID()},tokens[1])).status,400);
 r=await get(code,tokens[0]);const requestId=crypto.randomUUID(),payload={op:'start',code,revision:r.data.revision,requestId};let started=await call(payload,tokens[0]);assert.equal(started.status,200,JSON.stringify(started.data));assert.ok(started.data.game);const duplicate=await call(payload,tokens[0]);assert.equal(duplicate.status,200);assert.equal(duplicate.data.revision,started.data.revision);
 let actions=0;
 for(let move=0;move<20;move++){
  const common=(await get(code,tokens[0])).data;if(common.game.phase==='over')break;const actor=common.game.turn;const own=(await get(code,tokens[actor])).data;const g=own.game;
  for(let i=0;i<4;i++)assert.equal(g.players[i].hand.length,i===actor?g.players[i].count:0);
  assert.equal(g.deck,undefined);assert.equal(g.pending?.illegal,undefined);assert.equal(own.seats[0].hash,undefined);
  const bad=await call({op:'action',code,revision:own.revision,requestId:crypto.randomUUID(),action:{type:'draw'}},tokens[(actor+1)%4]);assert.equal(bad.status,400);
  const color=mode==='flip'&&g.side===1?'pink':'red';let action;
  if(g.phase==='color')action={type:'color',color};
  else{const legal=g.legal.find(l=>l.flex)||g.legal.find(l=>l.normal);if(legal)action={type:'play',id:legal.id,flex:legal.flex,color,target:(actor+1)%4,uno:true};else action={type:g.pending?'accept':g.drawn?'pass':'draw'}}
  const updated=await call({op:'action',code,revision:own.revision,requestId:crypto.randomUUID(),action},tokens[actor]);assert.equal(updated.status,200,JSON.stringify(updated.data));actions++;
  const observers=await Promise.all(tokens.map(t=>get(code,t)));assert.ok(observers.every(o=>o.status===200&&o.data.revision===updated.data.revision));assert.equal(new Set(observers.map(o=>o.data.game.top.id)).size,1);
  if(mode==='flip')for(let who=0;who<4;who++)for(let other=0;other<4;other++){
   const view=observers[who].data.game,ownHand=observers[other].data.game.players[other].hand;
   assert.deepEqual(view.players[other].backs,who===other?[]:ownHand.map(c=>view.side===1?c.a:c.b));
  }
 }
 const reconnect=await get(code,tokens[2]);assert.equal(reconnect.data.viewer,2);assert.equal(reconnect.data.game.players[2].hand.length,reconnect.data.game.players[2].count);
 // Switching devices preserves the game and hands, but changes who may operate it.
 const before=(await get(code,tokens[0])).data;
 const denied=await call({op:'mode',code,playMode:'shared',revision:before.revision,requestId:crypto.randomUUID()},tokens[1]);assert.equal(denied.status,400);
 const switched=await call({op:'mode',code,playMode:'shared',revision:before.revision,requestId:crypto.randomUUID()},tokens[0]);assert.equal(switched.status,200);assert.equal(switched.data.playMode,'shared');
 assert.equal(switched.data.game.revision,before.game.revision);assert.equal(switched.data.game.top.id,before.game.top.id);
 const g=switched.data.game;
 for(let i=0;i<4;i++)assert.equal(g.players[i].hand.length,i===g.turn?g.players[i].count:0);
 for(const t of tokens.slice(1)){const observer=(await get(code,t)).data;assert.ok(observer.game.players.every(p=>p.hand.length===0&&p.backs.length===0));assert.equal(observer.game.legal.length,0);assert.equal(observer.game.reveal,null)}
 const blocked=await call({op:'action',code,revision:switched.data.revision,requestId:crypto.randomUUID(),action:{type:'draw'}},tokens[1]);assert.equal(blocked.status,400);
 if(g.phase!=='over'){
  const action=g.phase==='color'?{type:'color',color:mode==='flip'&&g.side===1?'pink':'red'}:{type:g.pending?'accept':g.drawn?'pass':'draw'};
  const operated=await call({op:'action',code,revision:switched.data.revision,requestId:crypto.randomUUID(),action},tokens[0]);assert.equal(operated.status,200,JSON.stringify(operated.data));assert.equal(operated.data.game.revision,g.revision+1);
 }
 const current=(await get(code,tokens[0])).data;
 const restored=await call({op:'mode',code,playMode:'online',revision:current.revision,requestId:crypto.randomUUID()},tokens[0]);assert.equal(restored.status,200);assert.equal(restored.data.game.revision,current.game.revision);
 for(let i=0;i<4;i++){const own=(await get(code,tokens[i])).data;assert.equal(own.playMode,'online');own.game.players.forEach((p,j)=>assert.equal(p.hand.length,i===j?p.count:0))}
 // Starting on one device also supports joining three new devices mid-round.
 const solo=await call({op:'create',mode,name:'房主',playMode:'shared',names:['房主','玩家 2','玩家 3','玩家 4']});assert.equal(solo.status,200);assert.ok(solo.data.game);assert.equal(solo.data.seats.filter(s=>s.virtual).length,3);
 assert.equal((await call({op:'join',code:solo.data.code,mode,name:'访客'})).status,409);
 const online=await call({op:'mode',code:solo.data.code,playMode:'online',revision:solo.data.revision,requestId:crypto.randomUUID()},solo.data.token);assert.equal(online.status,200);
 for(let i=1;i<4;i++){const joined=await call({op:'join',code:solo.data.code,mode,name:'手机'+i});assert.equal(joined.status,200,JSON.stringify(joined.data));assert.equal(joined.data.viewer,i);assert.equal(joined.data.game.players[i].hand.length,7);assert.equal(joined.data.game.top.id,solo.data.game.top.id);assert.equal(joined.data.game.players[i].name,'手机'+i)}
 results.push({mode,clients:4,actions,privacy:'passed',turnAuthorization:'passed',optimisticConcurrency:'passed',idempotency:'passed',reconnect:'passed',hostModeSwitch:'passed',sharedSpectatorPrivacy:'passed',sharedToFourDevices:'passed'});console.log(mode+': four-client integration and device switching passed');
}
const lobby=await call({op:'create',mode:'classic',name:'旧房主'});
const guest=await call({op:'join',code:lobby.data.code,mode:'classic',name:'新房主'});
const sharedLobby=await call({op:'mode',code:lobby.data.code,revision:guest.data.revision,requestId:crypto.randomUUID(),playMode:'shared'},lobby.data.token);
const left=await call({op:'leave',code:lobby.data.code,revision:sharedLobby.data.revision,requestId:crypto.randomUUID()},lobby.data.token);assert.equal(left.status,200);
const promoted=(await get(lobby.data.code,guest.data.token)).data;assert.equal(promoted.host,1);
const newStart=await call({op:'start',code:lobby.data.code,revision:promoted.revision,requestId:crypto.randomUUID()},guest.data.token);assert.equal(newStart.status,200,JSON.stringify(newStart.data));assert.ok(newStart.data.game);
console.log('shared lobby host handoff passed');
await writeFile(new URL(process.env.UNO_TEST_RUNTIME==='node'?'../qa-network-node.json':'../qa-network.json',import.meta.url),JSON.stringify({testedAt:new Date().toISOString(),environment:process.env.UNO_TEST_RUNTIME==='node'?'Node.js + SQLite':'local Cloudflare D1 preview',results},null,2));
