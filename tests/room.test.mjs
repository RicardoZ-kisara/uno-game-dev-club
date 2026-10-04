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
 }
 const reconnect=await get(code,tokens[2]);assert.equal(reconnect.data.viewer,2);assert.equal(reconnect.data.game.players[2].hand.length,reconnect.data.game.players[2].count);
 results.push({mode,clients:4,actions,privacy:'passed',turnAuthorization:'passed',optimisticConcurrency:'passed',idempotency:'passed',reconnect:'passed'});console.log(mode+': four-client integration passed');
}
await writeFile(new URL('../qa-network.json',import.meta.url),JSON.stringify({testedAt:new Date().toISOString(),environment:'local Cloudflare D1 preview',results},null,2));
