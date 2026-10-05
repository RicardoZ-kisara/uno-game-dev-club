import {readRoom,insertRoom,saveRoom} from '@/db/rooms';
import {newGame,applyAction,nextRound,type Mode,type Action} from '@/lib/game';
import {roomView,tokenHash as hash,type Room} from '@/lib/room-view';
import {getRoomPresence,markRoomPresence} from '@uno/runtime';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function uid(){return crypto.randomUUID()+crypto.randomUUID()}
const rng=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
function code(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>chars[Math.floor(rng()*chars.length)]).join('')}
function cleanName(n:unknown){if(typeof n!=='string'||!n.trim()||n.trim().length>16)throw Error('昵称请输入 1–16 个字');return n.trim()}
async function output(r:Room,viewer:number,revision:number){return roomView(r,viewer,revision,await getRoomPresence(r.code))}
function fillSharedSeats(r:Room,names?:unknown){
 const requested=Array.isArray(names)&&names.length===4?names:null;
 r.seats=r.seats.map((s,i)=>s??{name:requested?cleanName(requested[i]):`玩家 ${i+1}`,avatar:i,hash:'',ready:true,virtual:true});
}
async function load(c:string){if(!/^[A-Z2-9]{6}$/.test(c))return null;const row=await readRoom(c);if(!row||row.expires<Date.now())return null;return {...row,room:JSON.parse(row.data) as Room}}
export async function GET(req:Request){try{const c=new URL(req.url).searchParams.get('code')??'';const data=await load(c);if(!data)return reply({error:'房间不存在或已超过 24 小时'},404);const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||token.length>150)return reply({error:'请先加入房间'},401);const h=await hash(token);const who=data.room.seats.findIndex(s=>s?.hash===h);if(who<0)return reply({error:'此设备尚未入座，请重新加入'},401);await markRoomPresence(c,h);
 const etag=`"${c}-${who}-${data.version}"`;
 const headers={'Cache-Control':'private, no-store',ETag:etag,Vary:'Authorization','X-Content-Type-Options':'nosniff'};
 // Authenticate before validating the version; another seat's tag cannot match.
 if(req.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});
 return Response.json(await output(data.room,who,data.version),{headers});
 }catch{return reply({error:'房间连接暂时中断，请稍后重试'},503)}}
export async function POST(req:Request){
 try{
  if(!req.headers.get('content-type')?.includes('application/json'))return reply({error:'需要 JSON 请求'},415);
  const text=await req.text();if(text.length>4096)return reply({error:'请求过大'},413);const b=JSON.parse(text);
  if(b.op==='create'){
   const mode:Mode=b.mode;if(!['classic','flip','flex'].includes(mode))return reply({error:'无效玩法'},400);if(b.finishMode!==undefined&&!['first','ranking'].includes(b.finishMode))return reply({error:'无效结束条件'},400);if(b.finishMode==='ranking'&&b.match500===true)return reply({error:'排名模式与 500 分模式不能同时启用'},400);const name=cleanName(b.name),token=uid();
   for(let attempt=0;attempt<3;attempt++){
    const c=code();if(await readRoom(c))continue;
    const room:Room={code:c,mode,playMode:b.playMode==='shared'?'shared':'online',seats:[{name,avatar:0,hash:await hash(token),ready:false},null,null,null],host:0,stacking:b.stacking===true,match500:b.match500===true,jumpIn:b.jumpIn===true,finishMode:b.finishMode==='ranking'?'ranking':'first',game:null,requests:[]};
    if(room.playMode==='shared'){fillSharedSeats(room,b.names);room.game=newGame(mode,room.seats.map(s=>({name:s!.name,avatar:s!.avatar})),{stacking:room.stacking,match500:room.match500,jumpIn:room.jumpIn,finishMode:room.finishMode},rng)}
    await insertRoom(c,JSON.stringify(room),Date.now()+86400000);return reply({...await output(room,0,1),token});
   }return reply({error:'房间创建繁忙，请重试'},503);
  }
  // Joining and setting one's ready flag can safely merge onto a newer room.
  // Re-read after a CAS collision, preserving the same operation identifier.
  const mergeable=b.op==='join'||b.op==='ready'&&typeof b.ready==='boolean';
  for(let attempt=0;attempt<6;attempt++){
  const data=await load(String(b.code??''));if(!data)return reply({error:'房间不存在或已超过 24 小时'},404);
  const r=data.room;
  if(b.op==='join'){
   if(r.playMode==='shared')return reply({error:'房主已切换为单设备四人，请在房主设备轮流操作'},409);
   if(r.game&&!r.seats.some(s=>s?.virtual))return reply({error:'牌局已经开始，仅已入座的设备可以重连'},409);
   if(b.mode!==r.mode)return reply({error:'房间玩法不同',mode:r.mode},409);
   const idx=r.seats.findIndex(s=>!s||s.virtual);if(idx<0)return reply({error:'四个座位已满'},409);
   const token=uid();if(r.host<0)r.host=idx;r.seats[idx]={name:cleanName(b.name),avatar:idx,hash:await hash(token),ready:!!r.game};
   if(r.game)r.game.players[idx].name=r.seats[idx]!.name;
   if(!await saveRoom(r.code,JSON.stringify(r),data.version))continue;
   return reply({...await output(r,idx,data.version+1),token});
  }
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||token.length>150)return reply({error:'请先入座'},401);
  const h=await hash(token);const who=r.seats.findIndex(s=>s?.hash===h);if(who<0)return reply({error:'此设备无操作权限'},403);
  if(typeof b.requestId!=='string'||b.requestId.length>80)return reply({error:'缺少操作标识'},400);
  const id=h+':'+b.requestId;if(r.requests.includes(id))return reply(await output(r,who,data.version));
  if(!mergeable&&b.revision!==data.version)return reply({error:'牌局已更新，请按最新状态操作'},409);
  if(b.op==='mode'){
   if(who!==r.host)throw Error('只有房主可以切换设备模式');
   if(!['online','shared'].includes(b.playMode))throw Error('无效设备模式');
   r.playMode=b.playMode;
   if(r.playMode==='shared')fillSharedSeats(r);
   else if(!r.game)r.seats=r.seats.map(s=>s?.virtual?null:s);
  }else if(b.op==='ready'){if(r.game)throw Error('对局已经开始');if(r.playMode==='shared')throw Error('单设备模式由房主开始');r.seats[who]!.ready=typeof b.ready==='boolean'?b.ready:!r.seats[who]!.ready}
  else if(b.op==='start'){
   if(who!==r.host)throw Error('只有房主可以开始');if(r.game)throw Error('牌局已经开始');if(r.playMode!=='shared'&&r.seats.some(s=>!s||!s.ready||s.virtual))throw Error('请等待四位玩家全部准备');
   r.game=newGame(r.mode,r.seats.map(s=>({name:s!.name,avatar:s!.avatar})),{stacking:r.stacking,match500:r.match500,jumpIn:r.jumpIn,finishMode:r.finishMode},rng);
  }else if(b.op==='action'){
   if(!r.game)throw Error('牌局还未开始');if(b.action?.type==='skip')throw Error('请由房主处理离线玩家');
   if(r.playMode==='shared'&&who!==r.host)throw Error('单设备模式请在房主设备操作');
   if(r.playMode!=='shared'&&r.seats[r.game.turn]?.virtual)throw Error('等待该座位的设备加入，或由房主切换单设备模式');
   r.game=applyAction(r.game,r.playMode==='shared'?r.game.turn:who,b.action as Action);
  }else if(b.op==='skipOffline'){
   if(who!==r.host)throw Error('只有房主可以跳过离线玩家');if(r.playMode==='shared'||!r.game||r.game.phase==='over')throw Error('当前不能跳过');const target=r.seats[r.game.turn];if(target&&!target.virtual&&(await getRoomPresence(r.code)).includes(target.hash))throw Error('该玩家仍在线');r.game=applyAction(r.game,r.game.turn,{type:'skip'});
  }else if(b.op==='next'){
   if(who!==r.host)throw Error('请等待房主开始下一局');if(!r.game)throw Error('没有可继续的牌局');r.game=nextRound(r.game);
  }else if(b.op==='leave'){
   if(r.game)throw Error('进行中的座位会保留，可关闭页面稍后重连');r.seats[who]=null;if(r.host===who)r.host=r.seats.findIndex(s=>s&&!s.virtual);
   if(r.playMode==='shared'){if(r.host>=0)fillSharedSeats(r);else{r.playMode='online';r.seats=r.seats.map(s=>s?.virtual?null:s)}}
  }else throw Error('未知操作');
  r.requests.push(id);r.requests=r.requests.slice(-100);
  if(!await saveRoom(r.code,JSON.stringify(r),data.version)){if(mergeable)continue;return reply({error:'牌局已更新，请重试'},409)}
  return reply(b.op==='leave'?{left:true}:await output(r,who,data.version+1));
  }
  return reply({error:'房间操作繁忙，请稍后重试'},409);
 }catch(e){return reply({error:e instanceof Error&& !/D1|SQL|JSON|database|Unexpected/i.test(e.message)?e.message:'房间服务暂时不可用，请重试'},400)}
}

