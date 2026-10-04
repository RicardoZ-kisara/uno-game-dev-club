import {COLOR_NAMES,face,label,type Card,type Face,type GameView} from './game.ts';

/** The same normal/boosted branches used by applyAction, expressed for the player. */
export function cardEffect(f:Face,boosted=false,side=0){
 const color=f.color==='wild'?'选择接下来跟随的颜色。':`出牌后跟${COLOR_NAMES[f.color]}色。`;
 let effect='';
 if(f.kind==='number')effect=boosted&&f.alt?`可用主色${COLOR_NAMES[f.color]}或副色${COLOR_NAMES[f.alt]}匹配；数字仍为 ${f.n}。`:`按${COLOR_NAMES[f.color]}色或数字 ${f.n} 匹配。`;
 else if(f.kind==='skip')effect=boosted?'跳过其余三人，由你继续出牌。':'跳过下一位玩家。';
 else if(f.kind==='skipAll')effect='跳过其余三人，由你继续出牌。';
 else if(f.kind==='reverse')effect=boosted?'反转方向，并跳过反转后的下一位玩家。':'反转出牌方向。';
 else if(f.kind==='flip')return `所有手牌、摸牌堆和弃牌堆翻到${side?'明':'暗'}面；两堆顺序翻转，以新顶牌颜色继续。`;
 else if(f.kind==='draw2'&&boosted)effect='其余三人各摸 1 张，下一位照常出牌。';
 else if(f.kind==='target2')effect=boosted?'指定一位对手摸 2 张，下一位照常出牌。':'只变色，不加牌。';
 else if(f.kind==='all2')effect=boosted?'其余三人各摸 2 张，下一位照常出牌。':'只变色，不加牌。';
 else if(f.kind==='wild4'&&boosted)effect='指定一位对手摸 4 张，下一位照常出牌；无普通加四的出牌限制与质疑。';
 else if(f.kind==='allFlip')effect='全员能量翻面；若翻面后全员耗尽，则全员恢复。';
 else if(f.kind==='wildColor')effect='下一位一直摸到指定颜色（含该张），并跳过回合。';
 else if(['draw1','draw2','draw5','wild2','wild4'].includes(f.kind))effect=`下一位摸 ${({draw1:1,draw2:2,draw5:5,wild2:2,wild4:4} as Record<string,number>)[f.kind]} 张并跳过回合。`;
 return `${effect}${color}`;
}

export function handCardInfo(card:Card,g:GameView,viewer:number,armed:boolean){
 const f=face(card,g.side),power=g.players[viewer].power;
 const boosted=g.mode==='flex'&&!!f.flex&&power&&armed;
 const legal=g.legal.find(l=>l.id===card.id);
 const playable=!!(boosted?legal?.flex:legal?.normal);
 let detail=cardEffect(f,boosted,g.side);
 if(boosted){
  const resets=g.players.every((p,i)=>i===viewer||!p.power);
  detail+=resets?'消耗能量后，全员耗尽将自动恢复。':'消耗你的强化能量。';
 }else if(f.flex&&g.mode==='flex')detail+=power?'开启 FLEX 可切换强化效果。':'能量已耗尽，当前仅普通效果。';
 if(f.power){
  const resets=power&&g.players.every((p,i)=>i===viewer||!p.power);
  detail+=resets?'翻转自身能量后全员耗尽，将全员恢复。':`此牌还会将你的能量翻为${power?'耗尽':'可用'}。`;
 }
 if(g.pending&&playable)detail+=`叠加后累计 +${g.pending.amount+Number(({draw1:1,draw2:2,draw5:5,wild2:2,wild4:4} as Record<string,number>)[f.kind]??0)}。`;
 if(!boosted&&['wild2','wild4','wildColor'].includes(f.kind)&&!g.stacking)detail+=g.mode==='flex'?'手中没有当前颜色或其他万能牌时才可合法打出；否则可被质疑。':'手中没有当前颜色牌时才可合法打出；否则可被质疑。';
 let reason=playable?'可出牌':g.turn!==viewer?'等待你的回合':g.phase!=='playing'?'请先选择颜色':g.drawn&&g.drawn!==card.id?'只能出刚摸到的牌':g.pending?'需接同类加牌，或接受惩罚':'当前不匹配';
 if(g.stacking&&!boosted&&['wild2','wild4'].includes(f.kind)&&!playable&&g.turn===viewer&&!g.pending)reason='当前颜色或万能牌限制';
 return {title:label(f),detail,boosted,playable,reason,badge:g.mode==='flex'?(boosted?'FLEX 强化':f.kind==='allFlip'||f.power?'能量翻转':'普通效果'):'卡牌效果'};
}
