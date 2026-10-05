import assert from 'node:assert/strict';
import WebSocket from 'ws';
const base=process.env.UNO_TEST_URL??'http://127.0.0.1:5173';
async function call(body,token){const res=await fetch(base+'/api/room',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:res.status,data:await res.json()}}
function connect(code,token){
 const url=new URL('/api/room/socket',base);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('code',code);
 const ws=new WebSocket(url),snapshots=[];let closed=false;
 ws.on('open',()=>ws.send(JSON.stringify({type:'subscribe',token})));ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='room'){assert.ok(!snapshots.length||m.room.revision>=snapshots.at(-1).revision,'revision must never regress');snapshots.push(m.room)}});ws.on('close',()=>closed=true);ws.on('error',()=>{});
 return {ws,snapshots,get closed(){return closed},get latest(){return snapshots.at(-1)},async wait(predicate){const start=Date.now();while(Date.now()-start<8000){if(predicate(this.latest))return this.latest;await new Promise(r=>setTimeout(r,20))}throw Error('WS snapshot timeout: '+JSON.stringify(this.latest))}};
}
for(const mode of ['classic','flip','flex']){
 const made=await call({op:'create',mode,name:'WS1',stacking:true,jumpIn:true,finishMode:'ranking'});assert.equal(made.status,200);const code=made.data.code,tokens=[made.data.token];
 for(let i=1;i<4;i++){const joined=await call({op:'join',code,mode,name:'WS'+(i+1)});assert.equal(joined.status,200);tokens.push(joined.data.token)}
 const bad=connect(code,'invalid');await bad.wait(()=>bad.closed);assert.equal(bad.snapshots.length,0,'unauthorized websocket must receive no room data');
 const clients=tokens.map(t=>connect(code,t));await Promise.all(clients.map(c=>c.wait(r=>r?.seats.every(s=>s.online))));
 const ready=await Promise.all(tokens.map(t=>call({op:'ready',code,revision:1,requestId:crypto.randomUUID(),ready:true},t)));ready.forEach(r=>assert.equal(r.status,200));
 await Promise.all(clients.map(c=>c.wait(r=>r?.seats.every(s=>s.ready))));
 const started=await call({op:'start',code,revision:clients[0].latest.revision,requestId:crypto.randomUUID()},tokens[0]);assert.equal(started.status,200);await Promise.all(clients.map(c=>c.wait(r=>r?.revision===started.data.revision)));
 for(let i=0;i<4;i++){const r=clients[i].latest;assert.equal(r.viewer,i);assert.equal(r.jumpIn,true);assert.equal(r.finishMode,'ranking');r.game.players.forEach((p,j)=>assert.equal(p.hand.length,i===j?p.count:0));assert.ok(r.seats.every(s=>s.hash===undefined));assert.equal(r.game.deck,undefined);assert.equal(r.game.pending?.illegal,undefined)}
 const turn=clients[0].latest.game.turn;
 const onlineDenied=await call({op:'skipOffline',code,revision:started.data.revision,requestId:crypto.randomUUID()},tokens[0]);assert.equal(onlineDenied.status,400,'online target cannot be skipped');
 const actor=clients[turn],beforeHand=actor.latest.game.players[turn].hand.map(c=>c.id);await new Promise(resolve=>{actor.ws.once('close',resolve);actor.ws.close()});
 const observer=clients.find((c,i)=>i!==turn);await observer.wait(r=>r?.seats[turn].online===false);
 const stranger=turn===1?2:1;assert.equal((await call({op:'skipOffline',code,revision:started.data.revision,requestId:crypto.randomUUID()},tokens[stranger])).status,400,'non-host cannot skip');
 assert.equal((await call({op:'action',code,revision:started.data.revision,requestId:crypto.randomUUID(),action:{type:'skip'}},tokens[turn])).status,400,'generic skip forbidden');
 // A disconnected host can still deliberately decide through an authorized HTTP
 // request; authorization is the saved seat credential, not the socket itself.
 const skipped=await call({op:'skipOffline',code,revision:started.data.revision,requestId:crypto.randomUUID()},tokens[0]);assert.equal(skipped.status,200,JSON.stringify(skipped.data));assert.notEqual(skipped.data.game.turn,turn);
 await observer.wait(r=>r?.revision===skipped.data.revision);
 const recovered=connect(code,tokens[turn]);clients[turn]=recovered;await recovered.wait(r=>r?.revision===skipped.data.revision&&r.seats[turn].online);assert.deepEqual(recovered.latest.game.players[turn].hand.map(c=>c.id),beforeHand,'skipping normal turn preserves hand');
 const shared=await call({op:'mode',code,revision:skipped.data.revision,requestId:crypto.randomUUID(),playMode:'shared'},tokens[0]);assert.equal(shared.status,200);await Promise.all(clients.map(c=>c.wait(r=>r?.revision===shared.data.revision)));
 for(const c of clients.slice(1)){assert.ok(c.latest.game.players.every(p=>!p.hand.length&&!p.backs.length));assert.equal(c.latest.game.legal.length,0);assert.equal(c.latest.game.reveal,null)}
 clients.forEach(c=>c.ws.close());console.log(mode+': WS auth, four-seat private push, concurrent ready, offline host decision, reconnect, shared privacy passed');
}
assert.equal((await call({op:'create',mode:'classic',name:'invalid',finishMode:'ranking',match500:true})).status,400);
assert.equal((await call({op:'create',mode:'classic',name:'invalid',finishMode:'unknown'})).status,400);
console.log('room option validation passed');
