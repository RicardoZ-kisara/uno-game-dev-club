import {WebSocketServer} from 'ws';
import {getRoomDatabase,getRoomPresence,markRoomPresence,roomEvents} from '../db/runtime.node.ts';
import {roomView,tokenHash} from '../lib/room-view.ts';

export function isAllowedSocketOrigin(req,publicOrigin=process.env.UNO_PUBLIC_ORIGIN??process.env.UNO_LAN_ORIGIN){
 if(!req.headers.origin)return true;
 const direct=`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;
 return req.headers.origin===direct||!!publicOrigin&&req.headers.origin===new URL(publicOrigin).origin;
}

export function attachRoomSockets(server){
 const wss=new WebSocketServer({noServer:true,maxPayload:512});
 const clients=new Map();
 async function push(ws){
  const c=clients.get(ws);if(!c?.hash||ws.readyState!==1)return;
  const row=await getRoomDatabase().prepare('SELECT data,version,expires FROM rooms WHERE code=?').bind(c.code).first();
  if(!row||row.expires<Date.now()){ws.close(4404,'Room expired');return}
  const room=JSON.parse(row.data),who=room.seats.findIndex(s=>s?.hash===c.hash);
  if(who<0){ws.close(4401,'Seat revoked');return}
  const online=await getRoomPresence(c.code);
  if(row.version<c.revision||ws.readyState!==1)return;c.revision=row.version;
  ws.send(JSON.stringify({type:'room',room:roomView(room,who,row.version,online)}));
 }
 function queue(ws){const c=clients.get(ws);if(c)c.queue=c.queue.then(()=>push(ws)).catch(()=>ws.close(1011,'Sync interrupted'))}
 const changed=e=>{for(const [ws,c] of clients)if(c.code===e.detail)queue(ws)};
 roomEvents().addEventListener('room',changed);
 server.on('upgrade',(req,socket,head)=>{
  const u=new URL(req.url??'/',`http://${req.headers.host}`);if(u.pathname!=='/api/room/socket')return;
  const code=u.searchParams.get('code')??'';
  if(!/^[A-Z2-9]{6}$/.test(code)||!isAllowedSocketOrigin(req)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return}
  wss.handleUpgrade(req,socket,head,ws=>{
   const c={code,hash:null,seen:Date.now(),revision:0,queue:Promise.resolve()};clients.set(ws,c);
   ws.on('message',message=>{
    c.queue=c.queue.then(async()=>{
     const m=JSON.parse(message.toString());
     if(!c.hash){if(m.type!=='subscribe'||typeof m.token!=='string'||!m.token||m.token.length>150){ws.close(4401,'Seat credential required');return}c.hash=await tokenHash(m.token);await push(ws);if(ws.readyState!==1)return;await markRoomPresence(code,c.hash,1)}
     else if(m.type!=='ping'&&m.type!=='resync'){ws.close(4400,'Invalid message');return}
     c.seen=Date.now();await markRoomPresence(code,c.hash);await push(ws);ws.send(JSON.stringify({type:'pong'}));
    }).catch(()=>ws.close(4400,'Invalid message'));
   });
   ws.on('error',()=>ws.close(1011,'Connection interrupted'));
   ws.on('close',()=>{clients.delete(ws);if(c.hash)void markRoomPresence(code,c.hash,-1)});
  });
 });
 const interval=setInterval(()=>{for(const [ws,c] of clients)if(Date.now()-c.seen>(c.hash?35000:10000))ws.close(c.hash?4000:4401,'Heartbeat expired');for(const code of new Set([...clients.values()].map(c=>c.code)))void getRoomPresence(code).then(()=>changed({detail:code}))},15000);interval.unref();
 server.on('close',()=>{clearInterval(interval);roomEvents().removeEventListener('room',changed);wss.close()});
 return wss;
}
