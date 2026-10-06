import {COLOR_NAMES,face,label,type Card,type Face,type GameView,DRAW_AMOUNTS} from './game.ts';

/** The same normal/boosted branches used by applyAction, expressed for the player. */
export function cardEffect(f:Face,boosted=false,side=0,remainingPlayers=4){
 const color=f.color==='wild'?'选择接下来跟随的颜色。':`出牌后跟${COLOR_NAMES[f.color]}色。`;
 let effect='';
 if(f.kind==='number')effect=boosted&&f.alt?`可用主色${COLOR_NAMES[f.color]}或副色${COLOR_NAMES[f.alt]}匹配；数字仍为 ${f.n}。`:`按${COLOR_NAMES[f.color]}色或数字 ${f.n} 匹配。`;
 else if(f.kind==='skip')effect=boosted?'跳过其余三人，由你继续出牌。':'跳过下一位玩家。';
 else if(f.kind==='skipAll')effect='跳过其余三人，由你继续出牌。';
 else if(f.kind==='reverse')effect=remainingPlayers===2?'仅剩两人，跳过对手，由你继续出牌。':boosted?'反转方向，并跳过反转后的下一位玩家。':'反转出牌方向。';
 else if(f.kind==='flip')return `所有手牌、摸牌堆和弃牌堆翻到${side?'明':'暗'}面；两堆顺序翻转，以新顶牌颜色继续。`;
 else if(f.kind==='draw2'&&boosted)effect='其余三人各摸 1 张，下一位照常出牌。';
 else if(f.kind==='target2')effect=boosted?'指定一位对手摸 2 张，下一位照常出牌。':'只变色，不加牌。';
 else if(f.kind==='all2')effect=boosted?'其余三人各摸 2 张，下一位照常出牌。':'只变色，不加牌。';
 else if(f.kind==='wild4'&&boosted)effect='指定一位对手摸 4 张，下一位照常出牌；无普通加四的出牌限制与质疑。';
 else if(f.kind==='allFlip')effect='全员能量翻面；若翻面后全员耗尽，则全员恢复。';
 else if(f.kind==='wildColor')effect='下一位一直摸到指定颜色（含该张），并跳过回合。';
 else if(['draw1','draw2','draw5','wild2','wild4'].includes(f.kind))effect=`下一位摸 ${DRAW_AMOUNTS[f.kind]} 张并跳过回合。`;
 return `${effect}${color}`;
}

/** One effective switch for presentation and submission, including stale UI state. */
export function effectiveFlexArmed(g:GameView,viewer:number,armed:boolean){
 return armed&&g.mode==='flex'&&g.phase==='playing'&&g.turn===viewer&&!g.pending&&!!g.players[viewer]?.power&&!g.rankings.includes(viewer);
}
export function handCardInfo(card:Card,g:GameView,viewer:number,armed:boolean){
 const f=face(card,g.side),power=g.players[viewer].power;
 const boosted=!!f.flex&&effectiveFlexArmed(g,viewer,armed);
 const legal=g.legal.find(l=>l.id===card.id);
 const playable=!!(boosted?legal?.flex:legal?.normal);
 let detail=cardEffect(f,boosted,g.side,g.players.filter((_,i)=>g.finishMode!=='ranking'||!g.rankings.includes(i)).length);
 if(g.finishMode==='ranking')detail=detail.replaceAll('其余三人',`其余 ${g.players.filter((_,i)=>i!==viewer&&!g.rankings.includes(i)).length} 人`);
 if(boosted){
  const resets=g.players.every((p,i)=>i===viewer||g.rankings.includes(i)||!p.power);
  detail+=resets?'消耗能量后，全员耗尽将自动恢复。':'消耗你的强化能量。';
 }else if(f.flex&&g.mode==='flex')detail+=g.pending?'罚牌期间强化不允许叠加，当前使用普通效果。':g.turn!==viewer?'非本人回合只能以普通效果抢出。':power?'开启 FLEX 可切换强化效果。':'能量已耗尽，当前仅普通效果。';
 if(f.power){
  const resets=power&&g.players.every((p,i)=>i===viewer||g.rankings.includes(i)||!p.power);
  detail+=resets?'翻转自身能量后全员耗尽，将全员恢复。':`此牌还会将你的能量翻为${power?'耗尽':'可用'}。`;
 }
 if(g.pending&&playable)detail+=`叠加后累计 +${g.pending.amount+Number(DRAW_AMOUNTS[f.kind]??0)}。`;
 if(!boosted&&['wild2','wild4','wildColor'].includes(f.kind)&&(f.kind==='wildColor'||!g.stacking))detail+=g.mode==='flex'?'手中没有当前颜色或其他万能牌时才可合法打出；否则可被质疑。':'手中没有当前颜色牌时才可合法打出；否则可被质疑。';
 let reason=playable?'可出牌':(boosted?legal?.flexReason:legal?.normalReason)??'牌局状态已更新，请重试';
 if(legal?.jump&&!boosted){reason='可抢出';detail+=g.pending?'可连出相同加牌，罚牌继续累加给原下一家。':'与顶牌完全相同，可立即抢出；也能接自己的上一张，从你的下一家继续。'}
 if(g.finishMode==='ranking')detail=detail.replaceAll('全员能量翻面','尚未出完的玩家能量翻面').replaceAll('全员耗尽','所有仍在牌局中的玩家能量耗尽').replaceAll('全员恢复','所有仍在牌局中的玩家恢复');
 return {title:label(f),detail,boosted,playable,reason,badge:g.mode==='flex'?(boosted?'FLEX 强化':f.kind==='allFlip'||f.power?'能量翻转':'普通效果'):'卡牌效果'};
}
