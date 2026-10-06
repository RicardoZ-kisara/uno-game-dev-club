import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,makeDeck,canPlay,canJump,applyAction,viewGame,playRejectionReason} from '../lib/game.ts';
import {handCardInfo,effectiveFlexArmed} from '../lib/card-effects.ts';
const names=['A','B','C','D'].map((name,avatar)=>({name,avatar}));
const deck=makeDeck('flex',()=>.5);
const find=(color,kind,boosted=false)=>deck.find(c=>c.a.color===color&&c.a.kind===kind&&!!c.a.flex===boosted);
function state(stacking=true){
 const g=newGame('flex',names,{stacking,jumpIn:true,dealer:3});
 g.turn=0;g.color='red';g.phase='playing';g.discard=[deck.find(c=>c.a.color==='red'&&c.a.kind==='number')];
 g.players.forEach((p,i)=>{p.hand=[{id:`hold${i}`,a:{color:'blue',kind:'number',n:8}}];p.power=true});
 return g;
}
test('stale armed FLEX uses ordinary cross-color +2 stacking for display and submission',()=>{
 let g=state();const attack=find('red','draw2'),reply=find('blue','draw2',true);
 g.players[0].hand.push(attack);g.players[1].hand.push(reply);
 g=applyAction(g,0,{type:'play',id:attack.id});
 const v=viewGame(g,1),legal=v.legal.find(l=>l.id===reply.id),info=handCardInfo(reply,v,1,true);
 assert.equal(legal.normal,true);assert.equal(legal.flex,false);assert.match(legal.flexReason,/强化效果不允许叠加/);
 assert.equal(effectiveFlexArmed(v,1,true),false);assert.equal(info.boosted,false);assert.equal(info.playable,true);
 assert.match(info.detail,/普通效果/);assert.match(info.detail,/累计 \+4/);
 assert.throws(()=>applyAction(g,1,{type:'play',id:reply.id,flex:true}),/强化效果不允许叠加/);
 const next=applyAction(g,1,{type:'play',id:reply.id,flex:info.boosted});assert.equal(next.pending.amount,4);assert.equal(next.players[1].power,true);
});
test('authoritative refusal reasons cover stacking options, printed value and nonnumeric FLEX wilds',()=>{
 for(const stacking of [false,true]){
  let g=state(stacking);const attack=find('wild','wild4',true),reply=find('blue','draw2',true);
  g.players[0].hand.push(attack);g.players[1].hand.push(reply);
  g=applyAction(g,0,{type:'play',id:attack.id,color:'red'});
  const reason=playRejectionReason(g,1,reply);
  assert.match(reason,stacking?/上一张印刷加牌值为 \+4，不能接 \+2/:/未开启加牌叠加/);
  assert.equal(viewGame(g,1).legal.find(l=>l.id===reply.id).normalReason,reason);
  assert.throws(()=>applyAction(g,1,{type:'play',id:reply.id}),e=>e.message.endsWith(reason));
 }
 const g=state();g.pending={amount:8,kind:'draw2',source:0,target:1,challenge:false};g.turn=1;
 assert.equal(canPlay(g,1,find('blue','draw2',true)),true,'compare printed +2, not cumulative +8');
 for(const kind of ['target2','all2'])assert.match(playRejectionReason(g,1,find('wild',kind,true)),/只有数值加牌能叠加/);
});
test('last-card settlement reason comes from private server state for first and ranking games',()=>{
 for(const finishMode of ['first','ranking']){
  let g=state();g.finishMode=finishMode;const attack=find('red','draw2'),reply=find('blue','draw2',true);
  g.players[0].hand=[attack];g.players[1].hand.push(reply);g=applyAction(g,0,{type:'play',id:attack.id});
  const view=viewGame(g,1);assert.equal(view.out,undefined);
  assert.match(handCardInfo(reply,view,1,true).reason,/最后一张.*结算罚牌/);
  assert.throws(()=>applyAction(g,1,{type:'play',id:reply.id}),/最后一张.*结算罚牌/);
  g=applyAction(g,1,{type:'accept'});assert.equal(g.pending,null);
  assert.equal(finishMode==='first'?g.phase:g.rankings[0],finishMode==='first'?'over':0);
 }
});
test('real FLEX deck preserves six-field jump equality and ordinary jumps with stale armed switch',()=>{
 const g=state();g.turn=1;const top=find('red','draw2',true),similar=find('red','draw2');g.discard=[top];
 const v=viewGame({...g,players:g.players.map((p,i)=>i===0?{...p,hand:[similar]}:p)},0);
 assert.equal(canJump(g,0,similar),false);assert.match(handCardInfo(similar,v,0,true).reason,/强化和能量标记全部一致/);
 const numbers=deck.filter(c=>c.a.color==='red'&&c.a.kind==='number'&&c.a.n===2);g.discard=[numbers[0]];
 assert.equal(numbers.length,2);assert.equal(canJump(g,0,numbers[1]),false,'same printed number differs in power/alt/flex');
 g.discard=[top];
 const exact={...top,id:'duplicate-for-rule-test'};g.players[0].hand.push(exact);
 assert.equal(canJump(g,0,exact),true);const info=handCardInfo(exact,viewGame(g,0),0,true);
 assert.equal(info.boosted,false);assert.equal(info.playable,true);assert.equal(info.reason,'可抢出');
 assert.equal(applyAction(g,0,{type:'play',id:exact.id,flex:info.boosted}).pending.amount,2);
 const wilds=deck.filter(c=>c.a.kind==='wild4');g.discard=[wilds[0]];g.players[0].hand.push(wilds[1]);
 assert.equal(canJump(g,0,wilds[1]),true,'actual duplicate wilds exist in makeDeck');
 g.jumpIn=false;assert.match(playRejectionReason(g,0,exact),/还没轮到你/);
});
test('legal metadata reveals only viewer card ids and public reasons',()=>{
 const g=state();g.players[0].hand.push(find('red','draw2'));
 for(let i=0;i<4;i++){
  const view=viewGame(g,i);assert.deepEqual(view.legal.map(l=>l.id),g.players[i].hand.map(c=>c.id));
  view.players.forEach((p,j)=>assert.equal(p.hand.length,i===j?g.players[i].hand.length:0));
  assert.equal(view.deck,undefined);assert.equal(view.pending?.proof,undefined);
 }
});
