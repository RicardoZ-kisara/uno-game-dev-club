import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,makeDeck,face,canPlay,applyAction,viewGame,colors,scoreFace,nextRound,canJump} from '../lib/game.ts';
import {handCardInfo} from '../lib/card-effects.ts';
const names=['A','B','C','D'].map((name,avatar)=>({name,avatar}));
const c=(id,color,kind='number',n=3,extra={})=>({id,a:{color,kind,n,...extra}});
function state(mode='classic',stacking=false){const g=newGame(mode,names,{dealer:3,stacking});g.turn=0;g.phase='playing';g.dir=1;g.side=0;g.color='red';g.pending=null;g.discard=[c('top','red','number',5)];g.players.forEach(p=>{p.hand=[c('s'+p.name,'blue','number',7),c('t'+p.name,'yellow','number',2)];p.power=true});return g}
test('deck counts, unique cards, FLIP two full sides, FLEX 1–8',()=>{for(const [mode,n] of [['classic',108],['flip',112],['flex',104]]){const d=makeDeck(mode);assert.equal(d.length,n);assert.equal(new Set(d.map(c=>c.id)).size,n);if(mode==='flip')assert.equal(d.filter(c=>c.b).length,112);if(mode==='flex')assert.ok(d.every(c=>c.a.kind!=='number'||(c.a.n>=1&&c.a.n<=8)))}});
test('matching rejects wrong color/number and out of turn',()=>{const g=state();const card=c('x','blue','number',3);assert.equal(canPlay(g,0,card),false);assert.equal(canPlay(g,1,c('a','red')),false);assert.throws(()=>applyAction(g,1,{type:'draw'}));assert.equal(canPlay(g,0,c('x','blue','number',5)),true)});
test('drawn card is the only playable card after a draw',()=>{let g=state();g.players[0].hand=[c('old','red'),c('hold','yellow')];g.deck.push(c('new','red'));g=applyAction(g,0,{type:'draw'});assert.equal(g.drawn,'new');assert.equal(canPlay(g,0,g.players[0].hand[0]),false);assert.equal(canPlay(g,0,g.players[0].hand.at(-1)),true);assert.throws(()=>applyAction(g,0,{type:'draw'}));g=applyAction(g,0,{type:'pass'});assert.equal(g.turn,1)});
test('official penalties cannot be stacked and skip after acceptance',()=>{let g=state();g.players[0].hand.push(c('atk','red','draw2'));g.players[1].hand.push(c('stack','blue','draw2'));g=applyAction(g,0,{type:'play',id:'atk'});assert.equal(canPlay(g,1,g.players[1].hand.at(-1)),false);const n=g.players[1].hand.length;g=applyAction(g,1,{type:'accept'});assert.equal(g.players[1].hand.length,n+2);assert.equal(g.turn,2)});
test('house stacking allows +4 after +2, keeps equal values and rejects +2 after +4',()=>{let g=state('classic',true);g.players[0].hand.push(c('atk','red','draw2'));g.players[1].hand.push(c('stack','blue','draw2'),c('mix','wild','wild4'));g.players[2].hand.push(c('smaller','blue','draw2'));g=applyAction(g,0,{type:'play',id:'atk'});assert.equal(canPlay(g,1,g.players[1].hand.find(c=>c.id==='stack')),true);assert.equal(canPlay(g,1,g.players[1].hand.find(c=>c.id==='mix')),true);g=applyAction(g,1,{type:'play',id:'mix',color:'blue'});assert.equal(g.pending.amount,6);const smaller=g.players[2].hand.find(c=>c.id==='smaller');assert.equal(canPlay(g,2,smaller),false);assert.throws(()=>applyAction(g,2,{type:'play',id:'smaller'}));assert.match(handCardInfo(smaller,viewGame(g,2),2,false).reason,/不小于/);g=applyAction(g,2,{type:'accept'});assert.equal(g.players[2].hand.length,9);assert.equal(g.turn,3)});
test('successful and failed Wild Draw Four challenges',()=>{for(const illegal of [true,false]){let g=state();g.players[0].hand=[c('wd','wild','wild4'),c('held',illegal?'red':'blue')];g=applyAction(g,0,{type:'play',id:'wd',color:'green'});assert.equal(g.pending.illegal,illegal);g=applyAction(g,1,{type:'challenge'});assert.equal(g.turn,illegal?1:2);assert.equal(g.players[illegal?0:1].hand.length,illegal?5:8);assert.ok(viewGame(g,1).reveal);assert.equal(viewGame(g,2).reveal,null)}});
test('FLEX ordinary Wild Draw Four considers other wilds a match',()=>{let g=state('flex');g.players[0].hand=[c('wd','wild','wild4',0,{flex:'wild4'}),c('wild','wild','allFlip')];g=applyAction(g,0,{type:'play',id:'wd',color:'blue'});assert.equal(g.pending.illegal,true)});
test('FLEX secondary color matches but primary color continues',()=>{let g=state('flex');g.players[0].hand.push(c('fl','yellow','number',8,{alt:'red',flex:'color'}));assert.equal(canPlay(g,0,g.players[0].hand.at(-1)),false);g=applyAction(g,0,{type:'play',id:'fl',flex:true});assert.equal(g.color,'yellow');assert.equal(g.players[0].power,false);assert.equal(g.turn,1)});
test('FLEX target draw does not skip and ignores ordinary WDF restriction',()=>{let g=state('flex');g.players[0].hand=[c('wd','wild','wild4',0,{flex:'wild4'}),c('held','red')];g=applyAction(g,0,{type:'play',id:'wd',flex:true,color:'green',target:1});assert.equal(g.turn,1);assert.equal(g.players[1].hand.length,6);assert.equal(g.pending,null);assert.equal(g.players[0].power,false)});
test('FLEX group draw and all-red reset',()=>{let g=state('flex');g.players.slice(1).forEach(p=>p.power=false);g.players[0].hand.push(c('all','red','draw2',0,{flex:'draw2'}));g=applyAction(g,0,{type:'play',id:'all',flex:true});assert.equal(g.turn,1);assert.ok(g.players.every(p=>p.power));assert.ok(g.players.slice(1).every(p=>p.hand.length===3))});
test('FLEX reverse skips first player in new direction',()=>{let g=state('flex');g.players[0].hand.push(c('r','red','reverse',0,{flex:'reverse'}));g=applyAction(g,0,{type:'play',id:'r',flex:true});assert.equal(g.dir,-1);assert.equal(g.turn,2)});
test('FLEX skip everyone gives same player a new turn',()=>{let g=state('flex');g.players[0].hand.push(c('s','red','skip',0,{flex:'skip'}));g=applyAction(g,0,{type:'play',id:'s',flex:true});assert.equal(g.turn,0)});
test('FLIP reverses physical draw/discard order and exposes old bottom',()=>{let g=state('flip');const back=color=>({color,kind:'number',n:7});g.discard=[{...c('oldbottom','blue'),b:back('purple')},{...c('oldtop','red'),b:back('teal')}];g.players[0].hand.push({...c('flip','red','flip'),b:back('orange')});const first=g.deck[0].id;g=applyAction(g,0,{type:'play',id:'flip'});assert.equal(g.side,1);assert.equal(g.discard.at(-1).id,'oldbottom');assert.equal(g.discard[0].id,'flip');assert.equal(g.deck.at(-1).id,first);assert.equal(g.color,'purple')});
test('FLIP draw-color stops on selected color and skips',()=>{let g=state('flip');g.side=1;g.color='purple';g.discard=[{id:'t',a:{color:'red',kind:'number',n:2},b:{color:'purple',kind:'number',n:2}}];g.players[0].hand=[{id:'wc',a:{color:'red',kind:'number',n:5},b:{color:'wild',kind:'wildColor'}},c('held','blue')];g.deck=[c('x','teal'),c('y','orange'),c('z','pink')];g=applyAction(g,0,{type:'play',id:'wc',color:'teal'});g=applyAction(g,1,{type:'accept'});assert.equal(g.players[1].hand.length,5);assert.equal(g.turn,2)});
test('UNO catch window closes when next player acts',()=>{let g=state();g.players[0].hand=[c('play','red'),c('left','blue')];g=applyAction(g,0,{type:'play',id:'play'});assert.equal(g.unoVulnerable,0);const caught=applyAction(g,1,{type:'catch'});assert.equal(caught.players[0].hand.length,3);g=applyAction(g,1,{type:'draw'});assert.throws(()=>applyAction(g,2,{type:'catch'}))});
test('UNO can be predeclared and saves penalty',()=>{let g=state();g.players[0].hand=[c('play','red'),c('left','blue')];g=applyAction(g,0,{type:'uno'});g=applyAction(g,0,{type:'play',id:'play'});assert.equal(g.unoVulnerable,null);assert.equal(g.players[0].called,true)});

test('UNO predeclaration is silent and the one-card transition produces exactly one announcement',()=>{
 let g=state();g.players[0].hand=[c('play','red'),c('left','blue')];const firstId=g.eventId;
 g=applyAction(g,0,{type:'uno'});assert.equal(g.players[0].called,true);assert.equal(g.events.filter(e=>e.id>firstId&&e.type==='uno').length,0);
 const revision=g.revision;g=applyAction(g,0,{type:'uno'});assert.equal(g.revision,revision);
 g=applyAction(g,0,{type:'play',id:'play',uno:true});assert.equal(g.events.filter(e=>e.id>firstId&&e.type==='uno').length,1);assert.equal(g.unoVulnerable,null);
 const afterPlay=g.revision;g=applyAction(g,0,{type:'uno'});assert.equal(g.revision,afterPlay);assert.equal(g.events.filter(e=>e.id>firstId&&e.type==='uno').length,1);
});

test('two-card off-turn UNO predeclaration requires an available jump and stays silent until the card is played',()=>{
 let g=state();g.jumpIn=true;g.players[0].hand=[c('first','red','number',5),c('pair','red','number',5),c('left','blue')];g=applyAction(g,0,{type:'play',id:'first'});assert.equal(g.turn,1);assert.equal(g.players[0].hand.length,2);
 const before=g.eventId;g=applyAction(g,0,{type:'uno'});assert.equal(g.players[0].called,true);assert.equal(g.eventId,before);g=applyAction(g,0,{type:'play',id:'pair'});assert.equal(g.unoVulnerable,null);assert.equal(g.events.filter(e=>e.id>before&&e.type==='uno').length,1);
 let blocked=state();blocked.jumpIn=true;assert.throws(()=>applyAction(blocked,2,{type:'uno'}));blocked.players[2].hand=[c('match','red','number',5),c('left','blue')];blocked.jumpIn=false;assert.throws(()=>applyAction(blocked,2,{type:'uno'}));
 blocked.jumpIn=true;blocked.drawn='drawn';assert.throws(()=>applyAction(blocked,2,{type:'uno'}));
 let penalty=state('classic',true);penalty.jumpIn=true;penalty.players[0].hand=[c('first','red','draw2'),c('pair','red','draw2'),c('left','blue')];penalty=applyAction(penalty,0,{type:'play',id:'first'});penalty=applyAction(penalty,0,{type:'uno'});assert.equal(penalty.players[0].called,true);assert.equal(penalty.events.some(e=>e.type==='uno'),false);penalty=applyAction(penalty,0,{type:'play',id:'pair'});assert.equal(penalty.unoVulnerable,null);assert.equal(penalty.events.filter(e=>e.type==='uno').length,1);
});

test('one-card late UNO emits once immediately and closes the catch window',()=>{
 let g=state();g.players[0].hand=[c('play','red'),c('left','blue')];g=applyAction(g,0,{type:'play',id:'play'});assert.equal(g.unoVulnerable,0);assert.equal(g.events.filter(e=>e.type==='uno').length,0);
 g=applyAction(g,0,{type:'uno'});assert.equal(g.events.at(-1).type,'uno');assert.equal(g.events.at(-1).actor,0);assert.equal(g.unoVulnerable,null);const revision=g.revision;
 g=applyAction(g,0,{type:'uno'});assert.equal(g.revision,revision);assert.equal(g.events.filter(e=>e.type==='uno').length,1);assert.throws(()=>applyAction(g,1,{type:'catch'}));
});

test('UNO precedes skip, color, attack, flip and FLEX effects from the same card',()=>{
 const cases=[['classic','skip',{}],['classic','reverse',{}],['classic','draw2',{}],['classic','wild',{}],['flip','flip',{}],['flex','draw2',{flex:'draw2'}],['flex','allFlip',{}],['flex','number',{power:true}]];
 for(const [mode,kind,extra] of cases){
  let g=state(mode);const card=c('play',['wild','allFlip'].includes(kind)?'wild':'red',kind,3,extra);if(kind==='flip')card.b={color:'purple',kind:'number',n:3};g.players[0].hand=[card,c('left','blue')];const firstId=g.eventId;
  g=applyAction(g,0,{type:'play',id:'play',uno:true,flex:!!extra.flex,color:'green'});const events=g.events.filter(e=>e.id>firstId),uno=events.find(e=>e.type==='uno');assert.ok(uno,`${mode} ${kind} UNO missing`);assert.equal(events.filter(e=>e.type==='uno').length,1);assert.equal(events[0].type,'play');assert.equal(events[1].type,'uno');assert.ok(events.filter(e=>e.type!=='play'&&e.type!=='uno').every(e=>e.id>uno.id));assert.ok(events.length>2);
 }
});
test('final draw card settles before scoring; no stack after going out',()=>{let g=state('classic',true);g.players[0].hand=[c('last','red','draw2')];g.players[1].hand.push(c('stack','red','draw2'));g=applyAction(g,0,{type:'play',id:'last'});assert.equal(g.phase,'playing');assert.equal(canPlay(g,1,g.players[1].hand.at(-1)),false);g=applyAction(g,1,{type:'accept'});assert.equal(g.phase,'over');assert.equal(g.winner,0);assert.ok(g.players[0].score>0);assert.equal(nextRound(g).players[0].score,0)});
test('private projection hides other hands, deck and challenge truth',()=>{let g=state();g.players[0].hand.push(c('wd','wild','wild4'));g=applyAction(g,0,{type:'play',id:'wd',color:'red'});const v=viewGame(g,1);assert.equal(v.players[0].hand.length,0);assert.equal(v.players[1].hand.length,2);assert.equal(v.pending.illegal,undefined);assert.equal(v.pending.proof,undefined);assert.equal(v.deck,undefined)});
test('scores are based on the active face',()=>{assert.equal(scoreFace({color:'wild',kind:'wildColor'},'flip'),60);assert.equal(scoreFace({color:'red',kind:'draw1'},'flip'),10);assert.equal(scoreFace({color:'purple',kind:'skipAll'},'flip'),30)});
test('selected FLEX description follows normal, boosted and exhausted states',()=>{
 const g=state('flex'),card=c('preview','red','draw2',0,{flex:'draw2'});g.players[0].hand.push(card);
 const normal=handCardInfo(card,viewGame(g,0),0,false);assert.match(normal.detail,/下一位摸 2 张并跳过/);assert.equal(normal.boosted,false);
 const boosted=handCardInfo(card,viewGame(g,0),0,true);assert.match(boosted.detail,/其余三人各摸 1 张，下一位照常/);assert.equal(boosted.boosted,true);
 const result=applyAction(g,0,{type:'play',id:card.id,flex:true});assert.equal(result.turn,1);assert.equal(result.pending,null);assert.ok(result.players.slice(1).every(p=>p.hand.length===3));
 g.players[0].power=false;const exhausted=handCardInfo(card,viewGame(g,0),0,true);assert.equal(exhausted.boosted,false);assert.match(exhausted.detail,/能量已耗尽，当前仅普通/);assert.match(exhausted.detail,/下一位摸 2 张并跳过/);
});
test('preview matches actual secondary-color legality, plain cards and energy reset',()=>{
 const g=state('flex'),alt=c('alt','yellow','number',8,{alt:'red',flex:'color'}),plain=c('plain','red','number',4,{power:true});g.players[0].hand.push(alt,plain);
 assert.equal(handCardInfo(alt,viewGame(g,0),0,false).playable,false);assert.equal(handCardInfo(alt,viewGame(g,0),0,true).playable,true);
 assert.match(handCardInfo(alt,viewGame(g,0),0,true).detail,/出牌后跟黄色/);
 assert.equal(handCardInfo(plain,viewGame(g,0),0,true).boosted,false);assert.equal(handCardInfo(plain,viewGame(g,0),0,true).playable,true);
 g.players.slice(1).forEach(p=>p.power=false);assert.match(handCardInfo(alt,viewGame(g,0),0,true).detail,/全员耗尽将自动恢复/);
 assert.match(handCardInfo(plain,viewGame(g,0),0,true).detail,/将全员恢复/);
});
test('FLIP outward faces update after flip and draw without exposing active hands',()=>{
 let g=newGame('flip',names,{dealer:3},()=>0.42);g.phase='playing';g.side=0;g.color='red';g.turn=0;g.pending=null;
 const flipCard=g.players[0].hand.find(c=>c.a.kind==='flip')??g.deck.find(c=>c.a.kind==='flip');
 if(!g.players[0].hand.includes(flipCard)){g.deck=g.deck.filter(c=>c.id!==flipCard.id);g.players[0].hand.push(flipCard)}g.color=flipCard.a.color;
 function verify(){for(let viewer=0;viewer<4;viewer++){const v=viewGame(g,viewer);for(let i=0;i<4;i++){assert.deepEqual(v.players[i].backs,i===viewer?[]:g.players[i].hand.map(c=>face(c,1-g.side)));assert.equal(v.players[i].hand.length,i===viewer?g.players[i].hand.length:0);}}}
 verify();g=applyAction(g,0,{type:'play',id:flipCard.id});assert.equal(g.side,1);verify();if(g.phase==='color')g=applyAction(g,g.turn,{type:'color',color:'teal'});g=applyAction(g,g.turn,{type:'draw'});verify();
});
test('300 simulated four-player games preserve cards and finish',()=>{for(const mode of ['classic','flip','flex'])for(let round=0;round<100;round++){let g=newGame(mode,names,{stacking:round%2===0});const total=makeDeck(mode).length;let turns=0;while(g.phase!=='over'&&turns++<2500){const who=g.turn;let action;if(g.phase==='color')action={type:'color',color:colors(g)[0]};else{let plays=g.players[who].hand.flatMap(c=>[false,true].filter(f=>canPlay(g,who,c,f)).map(f=>({c,f})));if(g.pending&&!plays.length)action={type:g.pending.challenge&&Math.random()<.5?'challenge':'accept'};else if(plays.length){const choice=plays[Math.floor(Math.random()*plays.length)];action={type:'play',id:choice.c.id,flex:choice.f,color:colors(g)[Math.floor(Math.random()*4)],target:(who+1)%4,uno:true}}else action={type:g.drawn?'pass':'draw'}}g=applyAction(g,who,action);const all=[...g.deck,...g.discard,...g.players.flatMap(p=>p.hand)];assert.equal(all.length,total);assert.equal(new Set(all.map(c=>c.id)).size,total);assert.ok(g.turn>=0&&g.turn<4)}assert.equal(g.phase,'over',`${mode} did not end`);assert.equal(g.players[g.winner].hand.length,0)}});

test('stacking compares the last printed amount, mixes types and ignores wild color restrictions',()=>{
 for(const mode of ['classic','flip','flex']){
  const small=mode==='flip'?'draw1':'draw2',large=mode==='flip'?'wild2':'wild4';
  let g=state(mode,true);g.players[0].hand=[c('open','red',small),c('held','red')];
  g.players[1].hand.push(c('larger','wild',large),c('matching','red'));
  g.players[2].hand.push(c('too-small','blue',small),c('equal','wild',large));
  g=applyAction(g,0,{type:'play',id:'open'});
  g=applyAction(g,1,{type:'play',id:'larger',color:'blue'});assert.equal(g.pending.challenge,false);assert.equal(g.pending.illegal,true);assert.equal(g.pending.amount,mode==='flip'?3:6);
  assert.equal(canPlay(g,2,g.players[2].hand.find(c=>c.id==='too-small')),false);
  const equal=g.players[2].hand.find(c=>c.id==='equal');assert.equal(canPlay(g,2,equal),true);
  g=applyAction(g,2,{type:'play',id:'equal',color:'blue'});assert.equal(g.pending.amount,mode==='flip'?5:10);assert.equal(g.pending.challenge,false);
 }
 let dark=state('flip',true);dark.side=1;dark.color='purple';dark.players[0].hand.push(c('five','purple','draw5'));dark.players[1].hand.push(c('two','wild','wild2'),c('color','wild','wildColor'));
 dark.players[1].hand.push(c('equal-five','orange','draw5'));dark=applyAction(dark,0,{type:'play',id:'five'});assert.equal(canPlay(dark,1,dark.players[1].hand.find(c=>c.id==='two')),false);assert.equal(canPlay(dark,1,dark.players[1].hand.find(c=>c.id==='equal-five')),true);assert.equal(canPlay(dark,1,dark.players[1].hand.find(c=>c.id==='color')),false);
});

test('numeric stacking allows an equal or larger incoming value for every draw amount',()=>{
 const amounts=[['draw1',1],['draw2',2],['wild2',2],['wild4',4],['draw5',5]];
 for(const [previous,n] of amounts)for(const [incoming,m] of amounts){
  let g=state('flip',true);g.players[0].hand.push(c('attack',previous.startsWith('wild')?'wild':'red',previous));
  const card=c('reply',incoming.startsWith('wild')?'wild':'blue',incoming);g.players[1].hand.push(card);
  g=applyAction(g,0,{type:'play',id:'attack',color:'red'});
  assert.equal(canPlay(g,1,card),m>=n,`+${n} followed by +${m}`);
  if(m>=n){g=applyAction(g,1,{type:'play',id:'reply',color:'blue'});assert.equal(g.pending.amount,n+m);assert.equal(g.pending.kind,incoming);assert.equal(g.pending.challenge,false)}
  else assert.throws(()=>applyAction(g,1,{type:'play',id:'reply',color:'blue'}),/无法出牌/);
 }
});

test('FLIP draw-until-color keeps challenges under stacking',()=>{
 let g=state('flip',true);g.side=1;g.color='purple';g.players[0].hand=[c('wild','wild','wildColor'),c('held','purple')];g=applyAction(g,0,{type:'play',id:'wild',color:'teal'});assert.equal(g.pending.challenge,true);assert.equal(g.pending.illegal,true);g=applyAction(g,1,{type:'challenge'});assert.equal(g.turn,1);assert.equal(g.pending,null);
});

test('jump-in in every variant requires an exact active face and resumes from the jumper',()=>{
 for(const mode of ['classic','flip','flex']){
  let g=state(mode);g.jumpIn=true;g.players[0].hand.push(c('play','red','number',5));g.players[2].hand.push(c('same','red','number',5));
  g=applyAction(g,0,{type:'play',id:'play'});const match=g.players[2].hand.at(-1);assert.equal(canJump(g,2,match),true);assert.equal(viewGame(g,2).legal.at(-1).jump,true);
  assert.equal(canJump(g,2,c('different','red','number',5,{alt:'blue'})),false);assert.equal(canJump(g,2,c('different','red','number',5,{power:true})),false);
  g=applyAction(g,2,{type:'play',id:'same'});assert.equal(g.turn,3);
  g.players[2].hand.push(c('own','red','number',5));g.events=[];assert.equal(canJump(g,2,g.players[2].hand.at(-1)),true);
  g.drawn='new';assert.equal(canJump(g,1,c('same','red','number',5)),false);g.drawn=null;g.pending={amount:2,kind:'draw2',source:2,target:3,challenge:false};assert.equal(canJump(g,1,c('same','red','number',5)),false);
 }
 let g=state('flip');g.jumpIn=true;g.side=1;g.discard=[{id:'top',a:{color:'red',kind:'number',n:8},b:{color:'purple',kind:'number',n:2}}];g.players[2].hand.push({id:'back-match',a:{color:'blue',kind:'number',n:1},b:{color:'purple',kind:'number',n:2}});assert.equal(canJump(g,2,g.players[2].hand.at(-1)),true);
});

test('jumped skip targets the jumper next opponent',()=>{
 let g=state();g.jumpIn=true;g.players[0].hand.push(c('skip','red','skip'));g.players[3].hand.push(c('same','red','skip'));g=applyAction(g,0,{type:'play',id:'skip'});assert.equal(g.turn,2);g=applyAction(g,3,{type:'play',id:'same'});assert.equal(g.turn,1);assert.equal(g.events.findLast(e=>e.type==='skip').target,0);
});

test('a player can jump their own matching card in every variant but unstackable penalties still block it',()=>{
 for(const mode of ['classic','flip','flex']){
  let g=state(mode);g.jumpIn=true;g.players[0].hand=[c('first','red','number',5),c('pair','red','number',5),c('left','blue')];
  g=applyAction(g,0,{type:'play',id:'first'});assert.equal(g.turn,1);assert.equal(canJump(g,0,g.players[0].hand[0]),true);assert.equal(viewGame(g,0).legal[0].jump,true);
  g=applyAction(g,0,{type:'play',id:'pair',uno:true});assert.equal(g.turn,1);assert.equal(g.players[0].hand.length,1);assert.equal(g.discard.at(-1).id,'pair');assert.equal(g.unoVulnerable,null);
  g=state(mode);g.jumpIn=true;g.players[0].hand=[c('first','red','draw2'),c('pair','red','draw2'),c('left','blue')];g=applyAction(g,0,{type:'play',id:'first'});assert.equal(canJump(g,0,g.players[0].hand[0]),false);assert.throws(()=>applyAction(g,0,{type:'play',id:'pair'}));assert.equal(g.pending.amount,2);
  g=state(mode);g.jumpIn=true;g.players[0].hand=[c('first','red','skip'),c('pair','red','skip'),c('left','blue')];g=applyAction(g,0,{type:'play',id:'first'});assert.equal(g.turn,2);g=applyAction(g,0,{type:'play',id:'pair'});assert.equal(g.turn,2);assert.equal(g.events.findLast(e=>e.type==='skip').target,1);
 }
});

test('stacking plus jump-in lets the attack source pair identical numeric draw cards onto the original target',()=>{
 for(const [mode,kind,color,side] of [['classic','draw2','red',0],['classic','wild4','wild',0],['flip','draw1','red',0],['flip','wild2','wild',0],['flip','draw5','purple',1],['flex','draw2','red',0],['flex','wild4','wild',0]]){
  let g=state(mode,true);g.jumpIn=true;g.side=side;g.color=side?'purple':'red';g.players[0].hand=[c('first',color,kind),c('pair',color,kind),c('left','blue')];g.players[2].hand.push(c('outsider',color,kind));
  const chosen=side?'teal':'green';g=applyAction(g,0,{type:'play',id:'first',color:chosen});const original=g.pending.amount;assert.equal(g.pending.target,1);assert.equal(canJump(g,0,g.players[0].hand[0]),true);assert.equal(canJump(g,2,g.players[2].hand.at(-1)),false);
  g=applyAction(g,0,{type:'play',id:'pair',color:chosen,uno:true});assert.equal(g.turn,1);assert.equal(g.pending.target,1);assert.equal(g.pending.amount,original*2);assert.equal(g.events.findLast(e=>e.type==='stack').target,1);const old=g.players[1].hand.length;g=applyAction(g,1,{type:'accept'});assert.equal(g.players[1].hand.length,old+original*2);assert.equal(g.turn,2);
 }
 let g=state('flip',true);g.jumpIn=true;g.side=1;g.color='purple';g.players[0].hand=[c('first','wild','wildColor'),c('pair','wild','wildColor'),c('left','blue')];g=applyAction(g,0,{type:'play',id:'first',color:'teal'});assert.equal(canJump(g,0,g.players[0].hand[0]),false);assert.throws(()=>applyAction(g,0,{type:'play',id:'pair',color:'teal'}));
 g=state('classic',true);g.players[0].hand=[c('first','red','draw2'),c('pair','red','draw2'),c('left','blue')];g=applyAction(g,0,{type:'play',id:'first'});assert.equal(canJump(g,0,g.players[0].hand[0]),false);
});

test('older states carrying lastActor do not reinstate the removed own-jump restriction',()=>{
 let g=state();g.jumpIn=true;g.players[0].hand=[c('first','red','number',5),c('pair','red','number',5),c('left','blue')];g=applyAction(g,0,{type:'play',id:'first'});g.lastActor=0;assert.equal(canJump(g,0,g.players[0].hand[0]),true);g=applyAction(g,0,{type:'play',id:'pair'});assert.equal(g.discard.at(-1).id,'pair');
});

test('stack and confirmed ranking events carry public recipients and rank after final penalties',()=>{
 let g=state('classic',true);g.finishMode='ranking';g.players[0].hand.push(c('first','red','draw2'));g.players[1].hand=[c('last','blue','draw2')];g=applyAction(g,0,{type:'play',id:'first'});g=applyAction(g,1,{type:'play',id:'last'});const stack=g.events.findLast(e=>e.type==='stack');assert.equal(stack.target,2);assert.equal(stack.amount,4);assert.equal(g.events.some(e=>e.type==='finish'),false);
 g=applyAction(g,2,{type:'accept'});const finish=g.events.findLast(e=>e.type==='finish'),damage=g.events.findLast(e=>e.type==='damage');assert.equal(finish.target,1);assert.equal(finish.actor,1);assert.equal(finish.rank,1);assert.ok(finish.id>damage.id);assert.equal(damage.target,2);assert.equal(damage.amount,4);for(let viewer=0;viewer<4;viewer++){assert.deepEqual(viewGame(g,viewer).events.find(e=>e.id===stack.id),stack);assert.deepEqual(viewGame(g,viewer).events.find(e=>e.id===finish.id),finish)}
 g.turn=3;g.color='red';g.players[3].hand=[c('second','red')];g=applyAction(g,3,{type:'play',id:'second'});assert.equal(g.events.findLast(e=>e.type==='finish').rank,2);assert.equal(g.events.findLast(e=>e.type==='finish').target,3);
});

test('ranking waits for final-card penalties, skips finishers, and ends after third finish in every variant',()=>{
 for(const mode of ['classic','flip','flex']){
  let g=state(mode,true);g.finishMode='ranking';g.players[0].hand=[c('last','red','draw2')];g.players[1].hand=[c('second','red')];g.players[2].hand=[c('third','red')];
  g=applyAction(g,0,{type:'play',id:'last'});assert.deepEqual(g.rankings,[]);assert.equal(g.out,0);assert.equal(canPlay(g,1,c('stack','red','draw2')),false);
  g=applyAction(g,1,{type:'accept'});assert.deepEqual(g.rankings,[0]);assert.equal(g.out,null);assert.equal(g.turn,2);
  g=applyAction(g,2,{type:'play',id:'third'});assert.deepEqual(g.rankings,[0,2]);assert.equal(g.turn,3);
  g=applyAction(g,3,{type:'skip'});assert.equal(g.turn,1);g.players[1].hand=[c('last-second','red')];g=applyAction(g,1,{type:'play',id:'last-second'});
  assert.equal(g.phase,'over');assert.deepEqual(g.rankings,[0,2,1,3]);assert.equal(g.winner,0);assert.ok(g.players.every(p=>p.score===0));assert.deepEqual(g.roundPoints,[0,0,0,0]);assert.equal(nextRound(g).finishMode,'ranking');
 }
});

test('ranking skips finished players for group damage, targeting and skips',()=>{
 let g=state('flex');g.finishMode='ranking';g.rankings=[1];g.players[1].hand=[];g.players[0].hand.push(c('group','red','draw2',0,{flex:'draw2'}));g=applyAction(g,0,{type:'play',id:'group',flex:true});assert.equal(g.players[1].hand.length,0);assert.equal(g.turn,2);assert.deepEqual(g.events.filter(e=>e.type==='damage').map(e=>e.target),[2,3]);assert.ok(g.events.filter(e=>e.type==='damage').every(e=>e.amount===1));
 g.turn=0;g.players[0].power=true;g.players[0].hand.push(c('target','wild','wild4',0,{flex:'wild4'}));assert.throws(()=>applyAction(g,0,{type:'play',id:'target',flex:true,color:'green',target:1}));
 g.players[0].hand.push(c('skip','red','skip'));g=applyAction(g,0,{type:'play',id:'skip'});assert.equal(g.events.findLast(e=>e.type==='skip').target,2);assert.equal(g.turn,3);
});

test('two remaining players treat normal and FLEX reverse as skip in both directions',()=>{
 for(const mode of ['classic','flip','flex'])for(const side of mode==='flip'?[0,1]:[0])for(const flex of mode==='flex'?[false,true]:[false])for(const dir of [1,-1]){
  let g=state(mode);g.finishMode='ranking';g.rankings=[1,3];g.players[1].hand=[];g.players[3].hand=[];g.side=side;g.color=side?'purple':'red';g.dir=dir;
  const reverse=c('reverse',g.color,'reverse',0,mode==='flex'?{flex:'reverse'}:{});g.players[0].hand.push(reverse);
  assert.match(handCardInfo(reverse,viewGame(g,0),0,flex).detail,/仅剩两人，跳过对手，由你继续出牌/);
  g=applyAction(g,0,{type:'play',id:'reverse',flex});assert.equal(g.turn,0);assert.equal(g.phase,'playing');assert.equal(g.dir,-dir);
  assert.deepEqual(g.events.findLast(e=>e.type==='skip').targets,[2]);assert.equal(g.events.filter(e=>e.type==='reverse').length,0);
  assert.equal(g.players[1].hand.length,0);assert.equal(g.players[3].hand.length,0);assert.equal(g.players[2].hand.length,2);
  if(flex)assert.equal(g.players[0].power,false);
 }
});

test('two-player last-card reverse still records third place and ends the ranking game',()=>{
 let g=state();g.finishMode='ranking';g.rankings=[1,3];g.players[1].hand=[];g.players[3].hand=[];g.players[0].hand=[c('last','red','reverse')];
 g=applyAction(g,0,{type:'play',id:'last'});assert.equal(g.phase,'over');assert.deepEqual(g.rankings,[1,3,0,2]);assert.equal(g.winner,1);assert.equal(g.events.findLast(e=>e.type==='skip').target,2);assert.equal(g.events.findLast(e=>e.type==='finish').rank,3);
});

test('normal reverse with three remaining players passes the turn in the new direction',()=>{
 let g=state();g.finishMode='ranking';g.rankings=[1];g.players[1].hand=[];g.players[0].hand.push(c('reverse','red','reverse'));
 g=applyAction(g,0,{type:'play',id:'reverse'});assert.equal(g.turn,3);assert.equal(g.dir,-1);assert.equal(g.events.filter(e=>e.type==='skip').length,0);assert.equal(g.events.at(-1).type,'reverse');
});

test('successful last-card wild challenge restores ranking participant before recording a finish',()=>{
 let g=state('flip');g.finishMode='ranking';g.side=1;g.color='purple';g.players[0].hand=[c('last','wild','wildColor')];g=applyAction(g,0,{type:'play',id:'last',color:'teal'});g.pending.illegal=true;g=applyAction(g,1,{type:'challenge'});assert.deepEqual(g.rankings,[]);assert.equal(g.out,null);assert.ok(g.players[0].hand.length>0);assert.equal(g.phase,'playing');
});

test('effects identify actual color, attack and penalty recipients and first-mode scores',()=>{
 let g=state();g.players[0].hand=[c('last','wild','wild4')];g=applyAction(g,0,{type:'play',id:'last',color:'green'});assert.equal(g.events.findLast(e=>e.type==='color').color,'green');assert.equal(g.events.findLast(e=>e.type==='attack').target,1);g=applyAction(g,1,{type:'accept'});assert.equal(g.events.findLast(e=>e.type==='damage').target,1);assert.equal(g.events.findLast(e=>e.type==='skip').target,1);assert.deepEqual(g.roundPoints,g.players.map((p,i)=>i===0?0:p.hand.reduce((s,c)=>s+scoreFace(face(c,g.side),g.mode),0)));assert.equal(g.events.findLast(e=>e.type==='win').amount,g.roundPoints.reduce((a,b)=>a+b,0));
});

test('offline turn skip preserves hand, resolves penalty and completes a last-card ranking',()=>{
 let g=state();g.drawn='test';g.unoVulnerable=1;const hand=g.players[0].hand;g=applyAction(g,0,{type:'skip'});assert.deepEqual(g.players[0].hand,hand);assert.equal(g.turn,1);assert.equal(g.drawn,null);assert.equal(g.unoVulnerable,null);assert.equal(g.events.at(-1).target,0);assert.throws(()=>applyAction(g,3,{type:'skip'}));
 g.phase='color';g=applyAction(g,1,{type:'skip'});assert.equal(g.color,'red');assert.equal(g.phase,'playing');assert.equal(g.turn,2);
 g=state();g.finishMode='ranking';g.rankings=[2,3];g.players[2].hand=[];g.players[3].hand=[];g.players[0].hand=[c('last','red','draw2')];g=applyAction(g,0,{type:'play',id:'last'});const n=g.players[1].hand.length;g=applyAction(g,1,{type:'skip'});assert.equal(g.players[1].hand.length,n+2);assert.equal(g.phase,'over');assert.deepEqual(g.rankings,[2,3,0,1]);assert.match(g.events.findLast(e=>e.type==='skip').text,/离线/);
});

test('old persisted games receive defaults without rewriting the source object',()=>{
 const g=state();for(const key of ['jumpIn','finishMode','rankings','roundPoints'])delete g[key];const v=viewGame(g,0);assert.equal(v.jumpIn,false);assert.equal(v.finishMode,'first');assert.deepEqual(v.rankings,[]);assert.deepEqual(v.roundPoints,[0,0,0,0]);assert.equal(g.jumpIn,undefined);const result=applyAction(g,0,{type:'skip'});assert.equal(result.jumpIn,false);assert.deepEqual(result.rankings,[]);
});

test('old finished games reconstruct loser costs from the active hand faces without adding scores again',()=>{
 for(const mode of ['classic','flip','flex']){
  const g=state(mode);g.phase='over';g.winner=0;g.players[0].hand=[];g.players[0].score=135;g.side=mode==='flip'?1:0;g.players[1].hand=[{id:'points',a:{color:'red',kind:'number',n:3},b:{color:'purple',kind:'draw5'}}];
  for(const key of ['jumpIn','finishMode','rankings','roundPoints'])delete g[key];
  const expected=g.players.map((p,i)=>i===0?0:p.hand.reduce((sum,c)=>sum+scoreFace(face(c,g.side),mode),0));const view=viewGame(g,2);assert.deepEqual(view.roundPoints,expected);assert.equal(view.players[0].score,135);assert.equal(g.roundPoints,undefined);assert.equal(view.roundPoints[1],mode==='flip'?20:3);
 }
 const ranking=state();ranking.phase='over';ranking.winner=0;ranking.finishMode='ranking';delete ranking.roundPoints;assert.deepEqual(viewGame(ranking,0).roundPoints,[0,0,0,0]);
});

test('ranking card descriptions count active opponents and exclude finished players from energy effects',()=>{
 const g=state('flex');g.finishMode='ranking';g.rankings=[1];g.players[1].hand=[];g.players[1].power=true;g.players[2].power=false;g.players[3].power=false;
 const skip=c('skip','red','skip',0,{flex:'skip'}),flip=c('flip','wild','allFlip');g.players[0].hand.push(skip,flip);
 const skipInfo=handCardInfo(skip,viewGame(g,0),0,true);assert.match(skipInfo.detail,/跳过其余 2 人/);assert.match(skipInfo.detail,/所有仍在牌局中的玩家能量耗尽/);assert.doesNotMatch(skipInfo.detail,/其余三人|全员/);
 const flipInfo=handCardInfo(flip,viewGame(g,0),0,false);assert.match(flipInfo.detail,/尚未出完的玩家能量翻面/);assert.doesNotMatch(flipInfo.detail,/全员/);
});

test('last-card FLIP with a wild new top still asks the next ranking participant for color',()=>{
 let g=state('flip');g.finishMode='ranking';g.discard=[{id:'bottom',a:{color:'red',kind:'number',n:8},b:{color:'wild',kind:'wild'}}];g.players[0].hand=[{id:'last',a:{color:'red',kind:'flip'},b:{color:'purple',kind:'number',n:3}}];g=applyAction(g,0,{type:'play',id:'last'});assert.deepEqual(g.rankings,[0]);assert.equal(g.phase,'color');assert.equal(g.turn,1);g=applyAction(g,1,{type:'color',color:'purple'});assert.equal(g.phase,'playing');assert.equal(g.color,'purple');
});

test('90 ranking simulations with jump-ins preserve every card and all four places',()=>{
 for(const mode of ['classic','flip','flex'])for(let round=0;round<30;round++){
  let g=newGame(mode,names,{stacking:round%2===0,jumpIn:true,finishMode:'ranking'});const total=makeDeck(mode).length;let turns=0;
  while(g.phase!=='over'&&turns++<4000){
   let who=g.turn,action;
   if(g.phase==='color')action={type:'color',color:colors(g)[0]};
   else{
    const jumps=g.players.flatMap((p,i)=>p.hand.filter(c=>canJump(g,i,c)).map(c=>({i,c})));
    if(jumps.length&&Math.random()<.4){const choice=jumps[0];who=choice.i;action={type:'play',id:choice.c.id,color:colors(g)[0],uno:true}}
    else{
     const choices=g.players[who].hand.flatMap(c=>[false,true].filter(f=>canPlay(g,who,c,f)).map(f=>({c,f})));
     if(g.pending&&!choices.length)action={type:g.pending.challenge&&Math.random()<.5?'challenge':'accept'};
     else if(choices.length){const choice=choices[Math.floor(Math.random()*choices.length)],target=g.players.findIndex((_,i)=>i!==who&&!g.rankings.includes(i));action={type:'play',id:choice.c.id,flex:choice.f,color:colors(g)[Math.floor(Math.random()*4)],target,uno:true}}
     else action={type:g.drawn?'pass':'draw'};
    }
   }
   g=applyAction(g,who,action);const all=[...g.deck,...g.discard,...g.players.flatMap(p=>p.hand)];assert.equal(all.length,total);assert.equal(new Set(all.map(c=>c.id)).size,total);if(g.phase!=='over')assert.equal(g.rankings.includes(g.turn),false);assert.ok(g.rankings.slice(0,3).every(i=>g.players[i].hand.length===0));
  }
  assert.equal(g.phase,'over',`${mode} ranking did not finish`);assert.equal(g.rankings.length,4);assert.equal(new Set(g.rankings).size,4);assert.equal(g.winner,g.rankings[0]);assert.ok(g.players.every(p=>p.score===0));
 }
});
