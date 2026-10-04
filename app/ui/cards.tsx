import {Ban,Repeat2,Rotate3d,FastForward,Zap,RefreshCw,Crosshair,Users} from 'lucide-react';
import {type Card,type Face,type EasterEgg,type Mode,face,label,cardEasterEgg,LIGHT} from '@/lib/game';
import type {CSSProperties} from 'react';
export const CAMEOS=['桃井','小绿','爱丽丝','柚子'] as const;
export function CameoArt({cameo,className=''}:{cameo:EasterEgg;className?:string}){
 return <span className={`cameo-art cameo-${cameo} ${className}`} aria-hidden="true"/>;
}
export function SeatBadge({seat}:{seat:number}){
 return <div className={`avatar seat-badge seat-tone-${seat%4}`} aria-hidden="true">{String(seat+1).padStart(2,'0')}</div>;
}
export function EggGallery({mode,onPreview}:{mode:Mode;onPreview:(cameo:EasterEgg)=>void}){
 return <div className="egg-gallery">{(['red','green','blue','yellow'] as const).map((color,i)=>{
  const f:Face={color,kind:'number',n:7,...(mode==='flex'?{flex:'color',alt:LIGHT[(LIGHT.indexOf(color)+2)%4]}:{})};
  return <PlayingCard key={color} card={{id:`preview-${color}`,a:f}} onClick={()=>onPreview(i as EasterEgg)}/>;
 })}</div>;
}
export function Symbol({f}:{f:Face}){if(f.kind==='number')return <>{f.n}</>;if(f.kind==='skip')return <Ban/>;if(f.kind==='reverse')return <Repeat2/>;if(f.kind==='flip')return <Rotate3d/>;if(f.kind==='skipAll')return <FastForward/>;if(f.kind==='allFlip')return <RefreshCw/>;if(f.kind==='target2')return <><Crosshair/><small>+2</small></>;if(f.kind==='all2')return <><Users/><small>+2</small></>;if(f.kind==='wild')return <span className="wild-diamond"/>;return <>{({draw1:'+1',draw2:'+2',draw5:'+5',wild2:'+2',wild4:'+4',wildColor:'+色'} as Record<string,string>)[f.kind]}</>}
export function PlayingCard({card,side=0,disabled=false,playable=false,selected=false,onClick,style,small=false}:{card:Card;side?:number;disabled?:boolean;playable?:boolean;selected?:boolean;onClick?:()=>void;style?:CSSProperties;small?:boolean}){
 const f=face(card,side),cameo=cardEasterEgg(f);
 const description=`${label(f)}${f.flex?' 可强化':''}${f.power?' 翻转自身能量':''}${cameo!==undefined?` · ${CAMEOS[cameo]}彩蛋`:''}`;
 const content=<>
  {cameo!==undefined&&<><CameoArt cameo={cameo} className="card-portrait"/><span className="card-foil"/><span className="cameo-signature">✦ {CAMEOS[cameo]}</span></>}
  <span className="card-corner"><Symbol f={f}/></span><span className="card-oval"><Symbol f={f}/></span><span className="card-corner bottom"><Symbol f={f}/></span>
  {f.flex&&<span className={`flex-mark ${f.alt?'color-'+f.alt:''}`}><Zap size={12}/>{f.alt?'':'FLEX'}</span>}
  {f.power&&<RefreshCw className="power-mark" size={13}/>}
  <span className="card-color-code">{({red:'R',blue:'B',green:'G',yellow:'Y',pink:'P',teal:'T',orange:'O',purple:'V',wild:'W'})[f.color]}</span>
 </>;
 const cls=`playing-card color-${f.color} ${cameo!==undefined?`egg-card cameo-${cameo}`:''} ${playable?'playable':''} ${selected?'selected':''} ${small?'small-card':''}`;
 return onClick?<button className={cls} style={style} disabled={disabled} onClick={onClick} title={description} aria-label={`${description}${playable?' 可出牌':''}`}>{content}</button>:<div className={cls} style={style} role="img" aria-label={description}>{content}</div>;
}
