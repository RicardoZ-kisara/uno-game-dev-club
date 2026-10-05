"use client";
import {useEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {ChevronLeft,ChevronRight,Zap} from 'lucide-react';
import {type Card,type GameView,face,label} from '@/lib/game';
import {handCardInfo,cardEffect} from '@/lib/card-effects';
import {PlayingCard} from './cards';

type Gesture={pointer:number;x:number;y:number;card:string;selected:boolean;browsing:boolean;cancelled:boolean;swipe:boolean;moved:boolean};
export default function Hand({game,viewer,armed,busy,touchTapToPlay,inspectOther=false,onPlay}:{game:GameView;viewer:number;armed:boolean;busy:boolean;touchTapToPlay:boolean;inspectOther?:boolean;onPlay:(card:Card)=>void}){
 const cards=game.players[viewer].hand;
 const inspecting=game.mode==='flip'&&inspectOther,displaySide=inspecting?1-game.side:game.side;
 function cardInfo(card:Card){if(!inspecting)return handCardInfo(card,game,viewer,armed);const f=face(card,displaySide);return {title:label(f),detail:`${cardEffect(f,false,displaySide,game.players.filter((_,i)=>!game.rankings.includes(i)).length)} 同一位置的明暗面一一对应；返回当前出牌面后才能出牌。`,boosted:false,playable:false,reason:'查看时不能出牌',badge:`${displaySide?'暗':'明'}面 · 仅查看`}}
 const [selected,setSelected]=useState<string|null>(null),[peek,setPeek]=useState<string|null>(null),[touching,setTouching]=useState(false),[swiping,setSwiping]=useState(false),[width,setWidth]=useState(0),[cardWidth,setCardWidth]=useState(100.8),[page,setPage]=useState(0);
 const fan=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null),ignoreTouchClick=useRef(false);
 // Keep enough of each card exposed to browse long hands with a finger.
 const exposed=width<600?32:48;
 const capacity=Math.max(1,Math.floor((width-cardWidth)/exposed)+1);
 const pages=Math.ceil(cards.length/capacity),safePage=Math.min(page,Math.max(0,pages-1));
 const shown=cards.slice(safePage*capacity,(safePage+1)*capacity);
 const activeId=cards.some(c=>c.id===peek)?peek:selected,active=cards.find(c=>c.id===activeId),info=active?cardInfo(active):null;
 useEffect(()=>{const el=fan.current;if(!el)return;const observer=new ResizeObserver(([entry])=>{setWidth(entry.contentRect.width);setCardWidth(el.querySelector('[data-hand-slot]')?.getBoundingClientRect().width||100.8)});observer.observe(el);return()=>observer.disconnect()},[]);
 function atX(x:number){
  const slots=Array.from(fan.current?.querySelectorAll<HTMLElement>('[data-hand-slot]')??[]);
  return slots.findLast(el=>el.getBoundingClientRect().left<=x)?.dataset.handSlot??shown[0]?.id;
 }
 function commit(id:string){const card=cards.find(c=>c.id===id);if(card&&!busy&&!inspecting&&handCardInfo(card,game,viewer,armed).playable){onPlay(card);setPeek(null)}}
 function down(e:PointerEvent<HTMLDivElement>){
  if(e.pointerType==='mouse'){ignoreTouchClick.current=false;return}
  if(gesture.current){gesture.current.cancelled=true;setSwiping(false);return}
  const id=(e.target as HTMLElement).closest<HTMLElement>('[data-hand-slot]')?.dataset.handSlot;
  if(!id)return;
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);ignoreTouchClick.current=true;
  gesture.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,card:id,selected:selected===id,browsing:false,cancelled:false,swipe:false,moved:false};
  setSelected(id);setPeek(id);setTouching(true);setSwiping(false);
 }
 function track(g:Gesture,x:number,y:number){
  const dx=x-g.x,up=g.y-y;
  if(Math.hypot(dx,up)>12)g.moved=true;
  if(Math.abs(dx)>18&&Math.abs(dx)>Math.abs(up))g.browsing=true;
  g.swipe=!inspecting&&!g.browsing&&up>=48&&up>Math.abs(dx)*1.3;
 }
 function move(e:PointerEvent<HTMLDivElement>){
  const g=gesture.current;
  if(e.pointerType==='mouse'){
   // Read the fixed slots, not the raised card bounds: no hover flicker or occlusion.
   if((e.target as HTMLElement).closest('[data-hand-slot]'))setPeek(atX(e.clientX)??null);
   return;
  }
  if(!g||g.pointer!==e.pointerId||g.cancelled)return;
  e.preventDefault();track(g,e.clientX,e.clientY);
  setSwiping(g.swipe);
  if(g.browsing){const id=atX(e.clientX);if(id){g.card=id;setPeek(id)}}
 }
 function end(e:PointerEvent<HTMLDivElement>,cancelled=false){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  e.preventDefault();
  if(!cancelled&&!g.cancelled){track(g,e.clientX,e.clientY);if(g.swipe||touchTapToPlay&&g.selected&&!g.moved&&!g.browsing)commit(g.card);else setSelected(g.card)}
  gesture.current=null;setTouching(false);setSwiping(false);setPeek(null);
 }
 function choose(id:string,keyboard:boolean){if(ignoreTouchClick.current&&!keyboard)return;const chosen=cards.some(c=>c.id===peek)?peek!:id;if(selected===chosen)commit(chosen);else setSelected(chosen)}
 return <>
  <div ref={fan} className={`hand-fan ${inspecting?'inspecting-other':''} ${touching?'touch-browsing':''} ${swiping&&!inspecting?'swipe-ready':''}`} aria-label={inspecting?'查看手牌另一面':'浏览手牌'} data-hand-side={displaySide} onPointerDown={down} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} onLostPointerCapture={e=>{if(gesture.current?.pointer===e.pointerId)end(e,true)}} onPointerLeave={e=>{if(e.pointerType==='mouse')setPeek(null)}}>
   <div className="hand-spread" style={{'--count':shown.length} as CSSProperties}>
    {shown.map((c,i)=>{const status=cardInfo(c);return <div key={c.id} data-hand-slot={c.id} className={`hand-slot ${selected===c.id?'is-selected':''} ${peek===c.id?'is-peeked':''}`} style={{'--i':i} as CSSProperties}>
     <PlayingCard card={c} side={displaySide} flipPair={game.mode==='flip'} playable={status.playable} selected={selected===c.id} onClick={e=>choose(c.id,e.detail===0)} onFocus={()=>setPeek(c.id)} onBlur={()=>setPeek(null)} ariaDescribedBy="hand-card-effect"/>
    </div>})}
   </div>
  </div>
  <div className={`hand-card-effect ${info?.boosted?'boosted':''}`} id="hand-card-effect" aria-live="polite" aria-atomic="true">
   {info?<><div className="effect-title"><b>{info.title}</b><span className="effect-badge">{info.boosted&&<Zap size={12}/>} {info.badge}</span><em className={info.playable?'can-play':''}>{inspecting?info.reason:busy?'正在出牌':info.reason}</em></div><p>{info.detail}</p></>:inspecting?<p className="selection-help">正在查看{displaySide?'暗':'明'}面 · 同一位置的明暗面一一对应<br/>返回当前出牌面后才能出牌</p>:<p className="selection-help">按住牌上划出牌 · 横划浏览{touchTapToPlay?' · 再点选中牌也可出牌':''}<span className="mouse-help">鼠标点击选中，再点出牌</span></p>}
   {swiping&&info?.playable&&<span className="swipe-label">松手出牌</span>}
   {pages>1&&<div className="hand-pages"><button aria-label="上一组手牌" disabled={safePage===0} onClick={()=>{setPage(safePage-1);setPeek(null)}}><ChevronLeft size={16}/></button><span>{safePage+1}/{pages}</span><button aria-label="下一组手牌" disabled={safePage===pages-1} onClick={()=>{setPage(safePage+1);setPeek(null)}}><ChevronRight size={16}/></button></div>}
  </div>
 </>;
}
