import {DurableObject} from 'cloudflare:workers';
import {roomView,tokenHash,type Room} from '../lib/room-view';
type Attachment={code:string;hash?:string;seen:number;revision?:number};
export class RoomStream extends DurableObject<Cloudflare.Env>{
 private async online(){
  const http=await this.ctx.storage.get<Record<string,number>>('http')??{};
  const now=Date.now(),set=new Set(Object.entries(http).filter(([,t])=>now-t<35000).map(([h])=>h));
  for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment() as Attachment;if(ws.readyState===1&&a.hash&&now-a.seen<35000)set.add(a.hash)}
  return [...set];
 }
 private async snapshot(ws:WebSocket){
  const a=ws.deserializeAttachment() as Attachment;if(!a.hash)return;
  const row=await this.env.DB!.prepare('SELECT data,version,expires FROM rooms WHERE code=?').bind(a.code).first<{data:string;version:number;expires:number}>();
  if(!row||row.expires<Date.now()){ws.close(4404,'Room expired');return}
  const room=JSON.parse(row.data) as Room,who=room.seats.findIndex(s=>s?.hash===a.hash);
  if(who<0){ws.close(4401,'Seat revoked');return}
  const online=await this.online(),latest=ws.deserializeAttachment() as Attachment;
  if(row.version<(latest.revision??0)||ws.readyState!==1)return;
  latest.revision=row.version;ws.serializeAttachment(latest);
  ws.send(JSON.stringify({type:'room',room:roomView(room,who,row.version,online)}));
 }
 private async broadcast(){await Promise.all(this.ctx.getWebSockets().map(ws=>this.snapshot(ws).catch(()=>ws.close(1011,'Sync interrupted'))))}
 async fetch(req:Request){
  const u=new URL(req.url),code=u.searchParams.get('code')??'';
  if(!/^[A-Z2-9]{6}$/.test(code))return new Response('Invalid room',{status:400});
  if(u.pathname==='/notify'&&req.method==='POST'){await this.broadcast();return new Response('ok')}
  if(u.pathname==='/presence')return Response.json(await this.online());
  if(u.pathname==='/touch'&&req.method==='POST'){
   const h=await req.text();if(!/^[a-f0-9]{64}$/.test(h))return new Response('Invalid seat',{status:400});
   const before=await this.online(),http=await this.ctx.storage.get<Record<string,number>>('http')??{};http[h]=Date.now();await this.ctx.storage.put('http',http);await this.ctx.storage.setAlarm(Date.now()+35000);
   if(!before.includes(h))await this.broadcast();return new Response('ok');
  }
  if(req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
  const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({code,seen:Date.now()} satisfies Attachment);await this.ctx.storage.setAlarm(Date.now()+10000);
  return new Response(null,{status:101,webSocket:client});
 }
 async webSocketMessage(ws:WebSocket,message:string|ArrayBuffer){
  try{
   if(typeof message!=='string'||message.length>512){ws.close(4400,'Invalid message');return}
   const m=JSON.parse(message),a=ws.deserializeAttachment() as Attachment;
   if(!a.hash){if(m.type!=='subscribe'||typeof m.token!=='string'||!m.token||m.token.length>150){ws.close(4401,'Seat credential required');return}a.hash=await tokenHash(m.token)}
   else if(m.type!=='ping'&&m.type!=='resync'){ws.close(4400,'Invalid message');return}
   a.seen=Date.now();ws.serializeAttachment(a);await this.snapshot(ws);if(ws.readyState!==1)return;await this.broadcast();ws.send(JSON.stringify({type:'pong'}));await this.ctx.storage.setAlarm(Date.now()+35000);
  }catch{ws.close(1011,'Sync interrupted')}
 }
 async webSocketClose(ws:WebSocket,code:number,reason:string){const a=ws.deserializeAttachment() as Attachment;a.seen=0;ws.serializeAttachment(a);if(![1005,1006,1015].includes(code))ws.close(code,reason);if(a.hash){const http=await this.ctx.storage.get<Record<string,number>>('http')??{};delete http[a.hash];await this.ctx.storage.put('http',http)}await this.broadcast()}
 async webSocketError(ws:WebSocket){const a=ws.deserializeAttachment() as Attachment;a.seen=0;ws.serializeAttachment(a);ws.close(1011,'Connection interrupted');await this.broadcast()}
 async alarm(){
  for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment() as Attachment;if(Date.now()-a.seen>(a.hash?35000:10000))ws.close(a.hash?4000:4401,'Heartbeat expired')}
  const http=await this.ctx.storage.get<Record<string,number>>('http')??{};for(const h of Object.keys(http))if(Date.now()-http[h]>=35000)delete http[h];await this.ctx.storage.put('http',http);await this.broadcast();if(this.ctx.getWebSockets().length||Object.keys(http).length)await this.ctx.storage.setAlarm(Date.now()+15000);
 }
}
