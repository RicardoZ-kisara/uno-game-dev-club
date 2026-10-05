import {viewGame,type Game,type Mode} from './game.ts';
export type Seat={name:string;avatar:number;hash:string;ready:boolean;virtual?:boolean}|null;
export type Room={code:string;mode:Mode;playMode?:'online'|'shared';seats:Seat[];host:number;stacking:boolean;match500:boolean;jumpIn?:boolean;finishMode?:'first'|'ranking';game:Game|null;requests:string[]};
export async function tokenHash(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('')}
// All transports project a fresh room for its authenticated seat. Never broadcast
// a mutation response, because that response contains the acting player's cards.
export function roomView(r:Room,viewer:number,revision:number,onlineHashes:string[]=[]){
 const shared=r.playMode==='shared';
 const game=r.game?viewGame(r.game,shared&&viewer===r.host?r.game.turn:viewer):null;
 if(game&&shared&&viewer!==r.host){game.players.forEach(p=>{p.hand=[];p.backs=[]});game.legal=[];game.drawn=null;game.reveal=null}
 return {code:r.code,mode:r.mode,playMode:r.playMode??'online',seats:r.seats.map(s=>s?{name:s.name,avatar:s.avatar,ready:s.ready,virtual:!!s.virtual,online:!!s.virtual||onlineHashes.includes(s.hash)}:null),host:r.host,stacking:r.stacking,match500:r.match500,jumpIn:r.jumpIn??false,finishMode:r.finishMode??'first',viewer,revision,game};
}
