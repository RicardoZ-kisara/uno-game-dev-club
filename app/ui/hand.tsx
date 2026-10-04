"use client";
import {useEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {ChevronLeft,ChevronRight,Zap} from 'lucide-react';
import {type Card,type GameView} from '@/lib/game';
import {handCardInfo} from '@/lib/card-effects';
import {PlayingCard} from './cards';

type Gesture={pointer:number;x:number;y:number;card:string;selected:boolean;browsing:boolean;cancelled:boolean;swipe:boolean};
export default function Hand({game,viewer,armed,busy,onPlay}:{game:GameView;viewer:number;armed:boolean;busy:boolean;onPlay:(card:Card)=>void}){
 const cards=game.players[viewer].hand;
 const [selected,setSelected]=useState<string|null>(null),[peek,setPeek]=useState<string|null>(null),[touching,setTouching]=useState(false),[swiping,setSwiping]=useState(false),[width,setWidth]=useState(0),[page,setPage]=useState(0);
 const fan=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null),ignoreClick=useRef(0);
 // Keep enough of each card exposed to browse long hands with a finger.
 const capacity=width&&width<600?10:16;
 const pages=Math.ceil(cards.length/capacity),safePage=Math.min(page,Math.max(0,pages-1));
 const shown=cards.slice(safePage*capacity,(safePage+1)*capacity);
 const activeId=peek??selected,active=cards.find(c=>c.id===activeId),info=active?handCardInfo(active,game,viewer,armed):null;
 useEffect(()=>{const el=fan.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(el);return()=>observer.disconnect()},[]);
 useEffect(()=>{if(selected&&!cards.some(c=>c.id===selected))setSelected(null);if(peek&&!cards.some(c=>c.id===peek))setPeek(null)},[cards,selected,peek]);
 function atX(x:number){
  const slots=Array.from(fan.current?.querySelectorAll<HTMLElement>('[data-hand-slot]')??[]);
  return slots.findLast(el=>el.getBoundingClientRect().left<=x)?.dataset.handSlot??shown[0]?.id;
 }
 function commit(id:string){const card=cards.find(c=>c.id===id);if(card&&!busy&&handCardInfo(card,game,viewer,armed).playable){onPlay(card);setPeek(null)}}
 function down(e:PointerEvent<HTMLDivElement>){
  if(e.pointerType==='mouse')return;
  if(gesture.current){gesture.current.cancelled=true;setSwiping(false);return}
  const id=(e.target as HTMLElement).closest<HTMLElement>('[data-hand-slot]')?.dataset.handSlot;
  if(!id)return;
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);ignoreClick.current=Date.now()+1000;
  gesture.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,card:id,selected:selected===id,browsing:false,cancelled:false,swipe:false};
  setPeek(id);setTouching(true);setSwiping(false);
 }
 function move(e:PointerEvent<HTMLDivElement>){
  const g=gesture.current;
  if(e.pointerType==='mouse'){
   // Read the fixed slots, not the raised card bounds: no hover flicker or occlusion.
   if((e.target as HTMLElement).closest('[data-hand-slot]'))setPeek(atX(e.clientX)??null);
   return;
  }
  if(!g||g.pointer!==e.pointerId||g.cancelled)return;
  e.preventDefault();const dx=e.clientX-g.x,up=g.y-e.clientY;
  if(Math.abs(dx)>18&&Math.abs(dx)>Math.abs(up))g.browsing=true;
  g.swipe=g.selected&&!g.browsing&&up>=64&&up>Math.abs(dx)*1.3;
  setSwiping(g.swipe);
  if(g.browsing){const id=atX(e.clientX);if(id){g.card=id;setPeek(id)}}
 }
 function end(e:PointerEvent<HTMLDivElement>,cancelled=false){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  e.preventDefault();ignoreClick.current=Date.now()+700;
  if(!cancelled&&!g.cancelled){if(g.swipe)commit(g.card);else setSelected(g.card)}
  gesture.current=null;setTouching(false);setSwiping(false);setPeek(null);
 }
 function choose(id:string){if(Date.now()<ignoreClick.current)return;const chosen=peek??id;if(selected===chosen)commit(chosen);else setSelected(chosen)}
 return <>
  <div ref={fan} className={`hand-fan ${touching?'touch-browsing':''} ${swiping?'swipe-ready':''}`} aria-label="浏览手牌" onPointerDown={down} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} onLostPointerCapture={e=>{if(gesture.current?.pointer===e.pointerId)end(e,true)}} onPointerLeave={e=>{if(e.pointerType==='mouse')setPeek(null)}}>
   <div className="hand-spread" style={{'--count':shown.length} as CSSProperties}>
    {shown.map((c,i)=>{const status=handCardInfo(c,game,viewer,armed);return <div key={c.id} data-hand-slot={c.id} className={`hand-slot ${selected===c.id?'is-selected':''} ${peek===c.id?'is-peeked':''}`} style={{'--i':i} as CSSProperties}>
     <PlayingCard card={c} side={game.side} playable={status.playable} selected={selected===c.id} onClick={()=>choose(c.id)} onFocus={()=>setPeek(c.id)} onBlur={()=>setPeek(null)} ariaDescribedBy="hand-card-effect"/>
    </div>})}
   </div>
  </div>
  <div className={`hand-card-effect ${info?.boosted?'boosted':''}`} id="hand-card-effect" aria-live="polite" aria-atomic="true">
   {info?<><div className="effect-title"><b>{info.title}</b><span className="effect-badge">{info.boosted&&<Zap size={12}/>} {info.badge}</span><em className={info.playable?'can-play':''}>{busy?'正在出牌':info.reason}</em></div><p>{info.detail}</p></>:<p className="selection-help">点击选中 · 再点出牌 / 选中后上划出牌</p>}
   {swiping&&info?.playable&&<span className="swipe-label">松手出牌</span>}
   {pages>1&&<div className="hand-pages"><button aria-label="上一组手牌" disabled={safePage===0} onClick={()=>{setPage(safePage-1);setPeek(null)}}><ChevronLeft size={16}/></button><span>{safePage+1}/{pages}</span><button aria-label="下一组手牌" disabled={safePage===pages-1} onClick={()=>{setPage(safePage+1);setPeek(null)}}><ChevronRight size={16}/></button></div>}
  </div>
 </>;
}
