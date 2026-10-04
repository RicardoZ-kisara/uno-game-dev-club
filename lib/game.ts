export type Mode='classic'|'flip'|'flex';
export type Color='red'|'yellow'|'green'|'blue'|'pink'|'teal'|'orange'|'purple'|'wild';
export type Face={color:Color;kind:string;n?:number;alt?:Color;flex?:string;power?:boolean};
export type Card={id:string;a:Face;b?:Face};
export type Player={name:string;avatar:number;hand:Card[];power:boolean;score:number;called:boolean};
export type EasterEgg=0|1|2|3|4;
export type Event={id:number;type:string;text:string;actor?:number;amount?:number;cameo?:EasterEgg};
export type Pending={amount:number;kind:string;source:number;target:number;color?:Color;illegal?:boolean;proof?:Face[];challenge:boolean};
export type Game={mode:Mode;players:Player[];deck:Card[];discard:Card[];side:0|1;color:Color;dir:1|-1;turn:number;dealer:number;round:number;phase:'playing'|'color'|'over';stacking:boolean;match500:boolean;pending:Pending|null;drawn:string|null;unoVulnerable:number|null;out:number|null;winner:number|null;matchWinner:number|null;events:Event[];eventId:number;revision:number;reveal:{viewer:number;faces:Face[]}|null};
export type Action={type:'play'|'draw'|'pass'|'uno'|'catch'|'challenge'|'accept'|'color';id?:string;flex?:boolean;color?:Color;target?:number;uno?:boolean};
export const LIGHT:Color[]=['red','yellow','green','blue'];
export const DARK:Color[]=['pink','teal','orange','purple'];
export const COLOR_NAMES:Record<Color,string>={red:'红',yellow:'黄',green:'绿',blue:'蓝',pink:'粉',teal:'青',orange:'橙',purple:'紫',wild:'万能'};
export const KINDS:Record<string,string>={number:'数字',skip:'跳过',reverse:'反转',draw1:'加一',draw2:'加二',draw5:'加五',wild:'变色',wild2:'万能加二',wild4:'万能加四',flip:'翻面',skipAll:'全体跳过',wildColor:'抽至指定色',target2:'定向加二',all2:'全体加二',allFlip:'全体能量翻转'};
export function face(card:Card,side=0):Face{return side===1&&card.b?card.b:card.a}
// Presentation only: every color has a portrait; wild cards feature Kei.
export function cardEasterEgg(f:Face):EasterEgg|undefined{
 return ({red:0,green:1,blue:2,yellow:3,pink:0,orange:1,purple:2,teal:3,wild:4} as Partial<Record<Color,EasterEgg>>)[f.color];
}
export function label(f:Face){return `${COLOR_NAMES[f.color]}色 ${f.kind==='number'?f.n:KINDS[f.kind]??f.kind}`}
export function colors(g:Pick<Game,'mode'|'side'>){return g.mode==='flip'&&g.side===1?DARK:LIGHT}
export function shuffled<T>(a:T[],rng= Math.random){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
export function makeDeck(mode:Mode,rng=Math.random):Card[]{
 let faces:Face[]=[];
 if(mode==='classic'){
  for(const color of LIGHT){faces.push({color,kind:'number',n:0});for(let n=1;n<=9;n++)for(let j=0;j<2;j++)faces.push({color,kind:'number',n});for(const kind of ['skip','reverse','draw2'])for(let j=0;j<2;j++)faces.push({color,kind})}
  for(let j=0;j<4;j++)faces.push({color:'wild',kind:'wild'},{color:'wild',kind:'wild4'});
 }
 if(mode==='flip'){
  const build=(cols:Color[],dark:boolean)=>{const fs:Face[]=[];for(const color of cols){for(let n=1;n<=9;n++)for(let j=0;j<2;j++)fs.push({color,kind:'number',n});for(const kind of [dark?'draw5':'draw1','reverse',dark?'skipAll':'skip','flip'])for(let j=0;j<2;j++)fs.push({color,kind})}for(let j=0;j<4;j++)fs.push({color:'wild',kind:'wild'},{color:'wild',kind:dark?'wildColor':'wild2'});return fs};
  faces=build(LIGHT,false);const backs=shuffled(build(DARK,true),rng);return shuffled(faces.map((a,i)=>({id:`f${i}`,a,b:backs[i]})),rng);
 }
 if(mode==='flex'){
  LIGHT.forEach((color,ci)=>{for(let n=1;n<=8;n++){faces.push({color,kind:'number',n,power:(color==='yellow'||color==='green')?n%2===1:n%2===0});faces.push({color,kind:'number',n,alt:LIGHT[(ci+1+(n%3))%4],flex:'color'})}for(const kind of ['skip','reverse','draw2'])faces.push({color,kind},{color,kind,flex:kind});});
  for(let i=0;i<4;i++)for(const kind of ['target2','all2','wild4','allFlip'])faces.push({color:'wild',kind,...(kind==='allFlip'?{}:{flex:kind})});
 }
 return shuffled(faces.map((a,i)=>({id:`${mode[0]}${i}`,a})),rng);
}
function event(g:Game,type:string,text:string,actor?:number,amount?:number){g.events.push({id:++g.eventId,type,text,actor,amount});g.events=g.events.slice(-32)}
function next(g:Game,i=g.turn,n=1){return (i+g.dir*n+40)%4}
function take(g:Game):Card|undefined{if(!g.deck.length&&g.discard.length>1){const top=g.discard.pop()!;g.deck=shuffled(g.discard);g.discard=[top];event(g,'shuffle','弃牌重新洗入摸牌堆')}return g.deck.pop()}
function draw(g:Game,p:number,n:number){let count=0;for(let i=0;i<n;i++){const c=take(g);if(!c)break;g.players[p].hand.push(c);count++}g.players[p].called=false;if(g.unoVulnerable===p)g.unoVulnerable=null;if(count)event(g,n>1?'damage':'draw',`${g.players[p].name} 摸了 ${count} 张牌`,p,count);return count}
function drawColor(g:Game,p:number,color:Color){let count=0;const limit=g.deck.length+g.discard.length-1;for(let i=0;i<limit;i++){const c=take(g);if(!c)break;g.players[p].hand.push(c);count++;if(face(c,g.side).color===color)break}g.players[p].called=false;event(g,'damage',`${g.players[p].name} 抽至${COLOR_NAMES[color]}色，共 ${count} 张`,p,count);return count}
function powerReset(g:Game){if(g.mode==='flex'&&g.players.every(p=>!p.power)){g.players.forEach(p=>p.power=true);event(g,'power','所有能量耗尽，全员恢复强化')}}
function flip(g:Game){g.side=g.side===0?1:0;g.deck.reverse();g.discard.reverse();g.color=face(g.discard.at(-1)!,g.side).color;event(g,'flip',g.side?'DARK SIDE · 暗面降临':'LIGHT SIDE · 重返光明')}
export function scoreFace(f:Face,mode:Mode){if(f.kind==='number')return f.n!;if(mode==='flip')return ({draw1:10,draw5:20,reverse:20,skip:20,skipAll:30,flip:20,wild:40,wild2:50,wildColor:60} as Record<string,number>)[f.kind]??20;return f.color==='wild'?50:20}
function finish(g:Game){if(g.out===null)return;const w=g.out;if(g.players[w].hand.length){g.out=null;return}if(g.pending)return;const points=g.players.reduce((sum,p,i)=>sum+(i===w?0:p.hand.reduce((s,c)=>s+scoreFace(face(c,g.side),g.mode),0)),0);g.players[w].score+=points;g.winner=w;g.phase='over';if(!g.match500||g.players[w].score>=500)g.matchWinner=w;event(g,'win',`${g.players[w].name} 赢得本局，获得 ${points} 分`,w,points)}
export function newGame(mode:Mode,names:{name:string;avatar:number;score?:number}[],opts:{stacking?:boolean;match500?:boolean;round?:number;dealer?:number}={},rng=Math.random):Game{
 if(names.length!==4)throw Error('需要四位玩家');
 const deck=makeDeck(mode,rng);const dealer=opts.dealer??Math.floor(rng()*4);
 const g:Game={mode,players:names.map(p=>({...p,score:p.score??0,hand:[],power:true,called:false})),deck,discard:[],side:0,color:'red',dir:1,turn:(dealer+1)%4,dealer,round:opts.round??1,phase:'playing',stacking:!!opts.stacking,match500:!!opts.match500,pending:null,drawn:null,unoVulnerable:null,out:null,winner:null,matchWinner:null,events:[],eventId:0,revision:1,reveal:null};
 for(let j=0;j<7;j++)for(let i=0;i<4;i++)g.players[i].hand.push(g.deck.pop()!);
 let opening=g.deck.pop()!;
 while((mode==='flex'&&opening.a.kind!=='number')||['wild4','wild2'].includes(opening.a.kind)){g.deck.unshift(opening);opening=g.deck.pop()!}
 g.discard.push(opening);g.color=opening.a.color;
 if(mode!=='flex'){
  const k=opening.a.kind;
  if(k==='skip')g.turn=next(g);
  if(k==='reverse'){g.dir=-1;g.turn=dealer}
  if(k==='draw1'||k==='draw2'){draw(g,g.turn,k==='draw1'?1:2);g.turn=next(g)}
  if(k==='flip')flip(g);
  if(g.color==='wild')g.phase='color';
 }
 event(g,'start',`第 ${g.round} 局开始 · ${g.players[g.turn].name} 先手`);return g;
}
function restricted(f:Face){return ['wild2','wild4','wildColor'].includes(f.kind)}
export function hasMatchingColor(g:Game,actor:number,card:Card){return g.players[actor].hand.some(c=>c.id!==card.id&&(face(c,g.side).color===g.color||(g.mode==='flex'&&face(c,g.side).color==='wild')))}
export function canPlay(g:Game,actor:number,card:Card,useFlex=false){
 if(g.phase!=='playing'||g.turn!==actor||(g.drawn&&g.drawn!==card.id)||g.out!==null)return false;
 const f=face(card,g.side);if(useFlex&&(!g.players[actor].power||!f.flex))return false;
 if(g.pending){return g.stacking&&!useFlex&&g.pending.kind===f.kind&&g.pending.kind!=='wildColor'&&(!restricted(f)||!hasMatchingColor(g,actor,card))}
 if(g.stacking&&restricted(f)&&!useFlex&&hasMatchingColor(g,actor,card))return false;
 const top=face(g.discard.at(-1)!,g.side);
 return f.color==='wild'||f.color===g.color||(useFlex&&f.alt===g.color)||(f.kind==='number'&&top.kind==='number'&&f.n===top.n)||(f.kind!=='number'&&f.kind===top.kind);
}
export function applyAction(original:Game,actor:number,a:Action):Game{
 const g:Game=structuredClone(original);if(!g.players[actor])throw Error('无效座位');const p=g.players[actor];
 if(a.type==='uno'){
  if(g.phase==='over'||(p.hand.length!==1&&!(p.hand.length===2&&actor===g.turn)))throw Error('剩两张准备出牌或剩一张时才能喊 UNO');
  p.called=true;if(g.unoVulnerable===actor)g.unoVulnerable=null;event(g,'uno',`${p.name}：UNO！`,actor);g.revision++;return g;
 }
 if(a.type==='catch'){
  const target=g.unoVulnerable;if(target===null||target===actor||g.players[target].called||g.players[target].hand.length!==1)throw Error('现在没有可举报的漏喊');
  draw(g,target,2);g.unoVulnerable=null;event(g,'catch',`${p.name} 抓到了漏喊 UNO`,actor);g.revision++;return g;
 }
 if(g.phase==='over')throw Error('本局已结束');if(g.turn!==actor)throw Error('还没轮到你');
 if(g.phase==='color'){
  if(a.type!=='color'||!a.color||!colors(g).includes(a.color))throw Error('请先选择起始颜色');g.color=a.color;g.phase='playing';event(g,'color',`${p.name} 选择${COLOR_NAMES[a.color]}色`,actor);g.revision++;return g;
 }
 if(a.type==='challenge'){
  const q=g.pending;if(!q?.challenge)throw Error('这张牌不能质疑');
  g.unoVulnerable=null;g.reveal={viewer:actor,faces:q.proof??[]};
  if(q.illegal){if(q.kind==='wildColor')drawColor(g,q.source,q.color!);else draw(g,q.source,q.amount);g.out=null;event(g,'challenge','质疑成功！出牌者承担惩罚',actor)}
  else {if(q.kind==='wildColor'){drawColor(g,actor,q.color!);draw(g,actor,2)}else draw(g,actor,q.amount+2);g.turn=next(g);event(g,'challenge','质疑失败，额外摸两张并跳过',actor)}
  g.pending=null;finish(g);g.revision++;return g;
 }
 if(a.type==='accept'||(a.type==='draw'&&g.pending)){
  const q=g.pending;if(!q)throw Error('没有待结算加牌');g.unoVulnerable=null;g.reveal=null;
  if(q.kind==='wildColor')drawColor(g,actor,q.color!);else draw(g,actor,q.amount);
  g.pending=null;g.turn=next(g);g.drawn=null;finish(g);g.revision++;return g;
 }
 if(a.type==='pass'){
  if(!g.drawn||g.pending)throw Error('摸牌后才可以选择过牌');g.unoVulnerable=null;g.drawn=null;g.reveal=null;g.turn=next(g);event(g,'pass',`${p.name} 过牌`,actor);g.revision++;return g;
 }
 if(a.type==='draw'){
  if(g.drawn)throw Error('本回合已经摸过牌');g.unoVulnerable=null;g.reveal=null;p.called=false;const c=take(g);
  if(c){p.hand.push(c);g.drawn=c.id;event(g,'draw',`${p.name} 摸了 1 张牌`,actor,1);if(!canPlay(g,actor,c,false)&&!canPlay(g,actor,c,true)){g.drawn=null;g.turn=next(g)}}
  else {g.turn=next(g);event(g,'pass','牌堆暂无可抽牌，过牌',actor)}g.revision++;return g;
 }
 if(a.type!=='play')throw Error('无效操作');
 const idx=p.hand.findIndex(c=>c.id===a.id);if(idx<0)throw Error('这张牌不在你的手牌中');const card=p.hand[idx];const f=face(card,g.side);const flex=!!a.flex;
 if(!canPlay(g,actor,card,flex))throw Error('这张牌当前无法出牌');
 if(f.color==='wild'&&(!a.color||!colors(g).includes(a.color)))throw Error('请指定有效颜色');
 if(flex&&['target2','wild4'].includes(f.kind)&&(!Number.isInteger(a.target)||a.target===actor||!g.players[a.target!]))throw Error('请选择另一位玩家');
 const illegal=restricted(f)&&!flex&&hasMatchingColor(g,actor,card);const proof=p.hand.filter(c=>c.id!==card.id).map(c=>face(c,g.side));
 const oldPending=g.pending;g.pending=null;g.unoVulnerable=null;g.reveal=null;g.drawn=null;p.hand.splice(idx,1);g.discard.push(card);g.color=f.color==='wild'?a.color!:f.color;
 if(flex){p.power=false;event(g,'flex',`${p.name} 发动 FLEX 强化！`,actor)}
 event(g,'play',`${p.name} 打出${label(f)}${flex?' · 强化':''}`,actor);
 const cameo=cardEasterEgg(f);if(cameo!==undefined)g.events[g.events.length-1].cameo=cameo;
 if(f.power){p.power=!p.power;event(g,'power',`${p.name} 的能量翻转为${p.power?'可用':'耗尽'}`,actor)}
 if(f.kind==='allFlip'){g.players.forEach(v=>v.power=!v.power);event(g,'power','全员能量翻转',actor)}
 let steps=1;
 if(f.kind==='reverse'){g.dir=g.dir===1?-1:1;if(flex)steps=2;event(g,'reverse',flex?'反转并跳过下一家':'出牌顺序反转',actor)}
 if(f.kind==='skip')steps=flex?0:2;if(f.kind==='skipAll')steps=0;
 if(f.kind==='flip')flip(g);
 const amount:Record<string,number>={draw1:1,draw2:2,draw5:5,wild2:2,wild4:4};
 if(flex&&f.kind==='draw2'){g.players.forEach((_,i)=>{if(i!==actor)draw(g,i,1)})}
 else if(flex&&f.kind==='all2'){g.players.forEach((_,i)=>{if(i!==actor)draw(g,i,2)})}
 else if(flex&&['wild4','target2'].includes(f.kind))draw(g,a.target!,f.kind==='wild4'?4:2);
 else if(amount[f.kind]||f.kind==='wildColor'){
  const n=(amount[f.kind]??0)+(oldPending?.amount??0);g.pending={amount:n,kind:f.kind,source:actor,target:next(g,actor),color:a.color,illegal,proof,challenge:restricted(f)&&!g.stacking};
  event(g,oldPending?'stack':'attack',oldPending?`加牌叠加 · 累计 +${n}`:f.kind==='wildColor'?'抽至指定色':`下一家 +${n}`,actor,n);
 }
 powerReset(g);
 if(p.hand.length===1){if(a.uno||p.called){p.called=true;event(g,'uno',`${p.name}：UNO！`,actor)}else g.unoVulnerable=actor}else p.called=false;
 if(p.hand.length===0)g.out=actor;
 g.turn=next(g,actor,steps);
 if(g.color==='wild'&&!g.pending&&g.out===null)g.phase='color';
 finish(g);g.revision++;return g;
}
export function nextRound(g:Game){if(g.phase!=='over')throw Error('当前对局尚未结束');return newGame(g.mode,g.players.map(p=>({name:p.name,avatar:p.avatar,score:g.matchWinner===null?p.score:0})),{stacking:g.stacking,match500:g.match500,round:g.matchWinner===null?g.round+1:1,dealer:(g.dealer+1)%4})}
export function viewGame(g:Game,viewer:number){
 return {mode:g.mode,players:g.players.map((p,i)=>({name:p.name,avatar:p.avatar,power:p.power,score:p.score,called:p.called,count:p.hand.length,hand:i===viewer?p.hand:[],backs:g.mode==='flip'&&i!==viewer?p.hand.map(c=>face(c,1-g.side)):[]})),side:g.side,color:g.color,dir:g.dir,turn:g.turn,round:g.round,phase:g.phase,stacking:g.stacking,match500:g.match500,pending:g.pending?{amount:g.pending.amount,kind:g.pending.kind,source:g.pending.source,target:g.pending.target,color:g.pending.color,challenge:g.pending.challenge}:null,drawn:viewer===g.turn?g.drawn:null,unoVulnerable:g.unoVulnerable,winner:g.winner,matchWinner:g.matchWinner,events:g.events,revision:g.revision,top:g.discard.at(-1)!,deckCount:g.deck.length,discardCount:g.discard.length,legal:g.players[viewer]?.hand.map(c=>({id:c.id,normal:canPlay(g,viewer,c,false),flex:canPlay(g,viewer,c,true)}))??[],reveal:g.reveal?.viewer===viewer?g.reveal.faces:null};
}
export type GameView=ReturnType<typeof viewGame>;
