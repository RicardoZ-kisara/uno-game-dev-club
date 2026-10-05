import {Ban,Repeat2,Rotate3d,FastForward,Zap,RefreshCw,Crosshair,Users} from 'lucide-react';
import {type Card,type Face,type EasterEgg,type Mode,face,label,cardEasterEgg,LIGHT,DARK,COLOR_NAMES} from '@/lib/game';
import {useState,type CSSProperties,type MouseEvent} from 'react';
export const CAMEOS=['桃井','小绿','爱丽丝','柚子','Kei','优香','诺亚','小雪','莉音'] as const;
export function CameoArt({cameo,className=''}:{cameo:EasterEgg;className?:string}){
 return <span className={`cameo-art cameo-${cameo} ${className}`} aria-hidden="true"/>;
}
export function SeatBadge({seat}:{seat:number}){
 return <div className={`avatar seat-badge seat-tone-${seat%4}`} aria-hidden="true">{String(seat+1).padStart(2,'0')}</div>;
}
export function EggGallery({mode,onPreview}:{mode:Mode;onPreview:(cameo:EasterEgg)=>void}){
 const [variant,setVariant]=useState(0);
 const palette=mode==='flip'&&variant===1?DARK:['red','green','blue','yellow'] as const;
 let samples:Face[]=palette.map(color=>({color,kind:'number',n:7,...(mode==='flex'?{flex:'color',alt:LIGHT[(LIGHT.indexOf(color)+2)%4]}:{})}));
 samples.push({color:'wild',kind:mode==='flip'?(variant===1?'wildColor':'wild2'):'wild4',...(mode==='flex'?{flex:'wild4'}:{})});
 if(mode==='flex'&&variant===1)samples=[{color:'red',kind:'draw2',flex:'draw2'},{color:'green',kind:'reverse',flex:'reverse'},{color:'blue',kind:'skip',flex:'skip'},{color:'yellow',kind:'number',n:1,power:true},...(['target2','all2','wild4','allFlip'] as const).map(kind=>({color:'wild' as const,kind,...(kind==='allFlip'?{}:{flex:kind})}))];
 return <>{mode!=='classic'&&<div className="portrait-tabs" role="group" aria-label="卡面类型">{(mode==='flip'?['明面','暗面']:['数字与副色','强化功能牌']).map((title,i)=><button key={title} aria-pressed={variant===i} onClick={()=>setVariant(i)}>{title}</button>)}</div>}<div className="egg-gallery">{samples.map((f,i)=><PlayingCard key={`${mode}-${variant}-${i}`} card={{id:`preview-${i}`,a:f}} onClick={()=>onPreview(cardEasterEgg(f)!)}/>)}</div></>;
}
export function Symbol({f}:{f:Face}){if(f.kind==='number')return <>{f.n}</>;if(f.kind==='skip')return <Ban/>;if(f.kind==='reverse')return <Repeat2/>;if(f.kind==='flip')return <Rotate3d/>;if(f.kind==='skipAll')return <FastForward/>;if(f.kind==='allFlip')return <RefreshCw/>;if(f.kind==='target2')return <><Crosshair/><small>+2</small></>;if(f.kind==='all2')return <><Users/><small>+2</small></>;if(f.kind==='wild')return <span className="wild-diamond"/>;return <>{({draw1:'+1',draw2:'+2',draw5:'+5',wild2:'+2',wild4:'+4',wildColor:'+色'} as Record<string,string>)[f.kind]}</>}
export function PlayingCard({card,side=0,disabled=false,playable=false,selected=false,onClick,onFocus,onBlur,ariaDescribedBy,style,small=false,flipPair=false}:{card:Card;side?:number;disabled?:boolean;playable?:boolean;selected?:boolean;onClick?:(event:MouseEvent<HTMLButtonElement>)=>void;onFocus?:()=>void;onBlur?:()=>void;ariaDescribedBy?:string;style?:CSSProperties;small?:boolean;flipPair?:boolean}){
 const f=face(card,side),cameo=cardEasterEgg(f);
 const description=`${label(f)}${f.flex?' 可强化':''}${f.alt?` 副色${COLOR_NAMES[f.alt]}`:''}${f.power?' 翻转自身能量':''}${cameo!==undefined?` · ${CAMEOS[cameo]}`:''}`;
 function artwork(f:Face){const cameo=cardEasterEgg(f);return <>
  {cameo!==undefined&&<><CameoArt cameo={cameo} className="card-portrait"/><span className="card-foil"/></>}
  <span className="card-corner"><Symbol f={f}/></span><span className="card-oval"><Symbol f={f}/></span><span className="card-corner bottom"><Symbol f={f}/></span>
  {f.flex&&<span className={`flex-mark ${f.alt?'color-'+f.alt:''}`}><Zap size={12}/>{f.alt?'':'FLEX'}</span>}
  {f.power&&<RefreshCw className="power-mark" size={13}/>}
 </>}
 const content=flipPair&&card.b?<span className={`hand-flip-turn ${side===1?'shows-dark':''}`} aria-hidden="true">{[card.a,card.b].map((f,i)=><span key={i} className={`hand-flip-face color-${f.color} ${cardEasterEgg(f)!==undefined?`egg-card cameo-${cardEasterEgg(f)}`:''} ${i===1?'flip-dark-face':''}`}>{artwork(f)}</span>)}</span>:artwork(f);
 const cls=`playing-card color-${f.color} ${cameo!==undefined?`egg-card cameo-${cameo}`:''} ${playable?'playable':''} ${selected?'selected':''} ${small?'small-card':''} ${flipPair&&card.b?'flip-pair-card':''}`;
 return onClick?<button className={cls} style={style} disabled={disabled} onClick={onClick} onFocus={onFocus} onBlur={onBlur} data-displayed-side={side} aria-pressed={selected} aria-describedby={ariaDescribedBy} aria-label={`${description}${playable?' 可出牌':''}`}>{content}</button>:<div className={cls} style={style} role="img" aria-label={description}>{content}</div>;
}
