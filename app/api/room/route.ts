import {readRoom,insertRoom,saveRoom} from '@/db/rooms';
import {newGame,applyAction,nextRound,viewGame,type Game,type Mode,type Action} from '@/lib/game';
export const dynamic='force-dynamic';
type Seat={name:string;avatar:number;hash:string;ready:boolean}|null;
type Room={code:string;mode:Mode;seats:Seat[];host:number;stacking:boolean;match500:boolean;game:Game|null;requests:string[]};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function uid(){return crypto.randomUUID()+crypto.randomUUID()}
async function hash(t:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))).map(b=>b.toString(16).padStart(2,'0')).join('')}
const rng=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
function code(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>chars[Math.floor(rng()*chars.length)]).join('')}
function cleanName(n:unknown){if(typeof n!=='string'||!n.trim()||n.trim().length>16)throw Error('昵称请输入 1–16 个字');return n.trim()}
function output(r:Room,viewer:number,revision:number){return {code:r.code,mode:r.mode,seats:r.seats.map(s=>s?{name:s.name,avatar:s.avatar,ready:s.ready}:null),host:r.host,stacking:r.stacking,match500:r.match500,viewer,revision,game:r.game?viewGame(r.game,viewer):null}}
async function load(c:string){if(!/^[A-Z2-9]{6}$/.test(c))return null;const row=await readRoom(c);if(!row||row.expires<Date.now())return null;return {...row,room:JSON.parse(row.data) as Room}}
export async function GET(req:Request){try{const c=new URL(req.url).searchParams.get('code')??'';const data=await load(c);if(!data)return reply({error:'房间不存在或已超过 24 小时'},404);const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||token.length>150)return reply({error:'请先加入房间'},401);const h=await hash(token);const who=data.room.seats.findIndex(s=>s?.hash===h);if(who<0)return reply({error:'此设备尚未入座，请重新加入'},401);return reply(output(data.room,who,data.version))}catch{return reply({error:'房间连接暂时中断，请稍后重试'},503)}}
export async function POST(req:Request){
 try{
  if(!req.headers.get('content-type')?.includes('application/json'))return reply({error:'需要 JSON 请求'},415);
  const text=await req.text();if(text.length>4096)return reply({error:'请求过大'},413);const b=JSON.parse(text);
  if(b.op==='create'){
   const mode:Mode=b.mode;if(!['classic','flip','flex'].includes(mode))return reply({error:'无效玩法'},400);const name=cleanName(b.name),token=uid();
   for(let attempt=0;attempt<3;attempt++){
    const c=code();if(await readRoom(c))continue;
    const room:Room={code:c,mode,seats:[{name,avatar:0,hash:await hash(token),ready:false},null,null,null],host:0,stacking:b.stacking===true,match500:b.match500===true,game:null,requests:[]};
    await insertRoom(c,JSON.stringify(room),Date.now()+86400000);return reply({...output(room,0,1),token});
   }return reply({error:'房间创建繁忙，请重试'},503);
  }
  const data=await load(String(b.code??''));if(!data)return reply({error:'房间不存在或已超过 24 小时'},404);
  const r=data.room;
  if(b.op==='join'){
   if(r.game)return reply({error:'牌局已经开始，仅已入座的设备可以重连'},409);
   if(b.mode!==r.mode)return reply({error:'房间玩法不同',mode:r.mode},409);
   const idx=r.seats.findIndex(s=>!s);if(idx<0)return reply({error:'四个座位已满'},409);
   const token=uid();if(r.host<0)r.host=idx;r.seats[idx]={name:cleanName(b.name),avatar:idx,hash:await hash(token),ready:false};
   if(!await saveRoom(r.code,JSON.stringify(r),data.version))return reply({error:'有人同时入座，请重试'},409);
   return reply({...output(r,idx,data.version+1),token});
  }
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||token.length>150)return reply({error:'请先入座'},401);
  const h=await hash(token);const who=r.seats.findIndex(s=>s?.hash===h);if(who<0)return reply({error:'此设备无操作权限'},403);
  if(typeof b.requestId!=='string'||b.requestId.length>80)return reply({error:'缺少操作标识'},400);
  const id=h+':'+b.requestId;if(r.requests.includes(id))return reply(output(r,who,data.version));
  if(b.revision!==data.version)return reply({error:'牌局已更新，请按最新状态操作'},409);
  if(b.op==='ready'){if(r.game)throw Error('对局已经开始');r.seats[who]!.ready=!r.seats[who]!.ready}
  else if(b.op==='start'){
   if(who!==r.host)throw Error('只有房主可以开始');if(r.game)throw Error('牌局已经开始');if(r.seats.some(s=>!s||!s.ready))throw Error('请等待四位玩家全部准备');
   r.game=newGame(r.mode,r.seats.map(s=>({name:s!.name,avatar:s!.avatar})),{stacking:r.stacking,match500:r.match500},rng);
  }else if(b.op==='action'){
   if(!r.game)throw Error('牌局还未开始');r.game=applyAction(r.game,who,b.action as Action);
  }else if(b.op==='next'){
   if(who!==r.host)throw Error('请等待房主开始下一局');if(!r.game)throw Error('没有可继续的牌局');r.game=nextRound(r.game);
  }else if(b.op==='leave'){
   if(r.game)throw Error('进行中的座位会保留，可关闭页面稍后重连');r.seats[who]=null;if(r.host===who)r.host=r.seats.findIndex(Boolean);
  }else throw Error('未知操作');
  r.requests.push(id);r.requests=r.requests.slice(-100);
  if(!await saveRoom(r.code,JSON.stringify(r),data.version))return reply({error:'牌局已更新，请重试'},409);
  return reply(b.op==='leave'?{left:true}:output(r,who,data.version+1));
 }catch(e){return reply({error:e instanceof Error&& !/D1|SQL|JSON|database|Unexpected/i.test(e.message)?e.message:'房间服务暂时不可用，请重试'},400)}
}

