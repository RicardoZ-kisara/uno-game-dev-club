import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import type {RoomDatabase} from './runtime-types';

// One lazy connection per server process. CAS updates remain atomic in SQLite.
const state=globalThis as typeof globalThis&{unoRoomSqlite?:DatabaseSync};
export function getRoomDatabase():RoomDatabase{
 if(!state.unoRoomSqlite){
  const filename=resolve(process.env.UNO_DATA_DIR??'.uno-data','rooms.sqlite');
  mkdirSync(dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, expires INTEGER NOT NULL);');
  db.prepare('DELETE FROM rooms WHERE expires < ?').run(Date.now());
  state.unoRoomSqlite=db;
 }
 const db=state.unoRoomSqlite;
 return {prepare(query){return {bind(...params){return {
  async first<T>(){return (db.prepare(query).get(...params) as T|undefined)??null},
  async run(){return {meta:{changes:Number(db.prepare(query).run(...params).changes)}}},
 }}}}};
}
export function getLanOrigin(){return process.env.UNO_LAN_ORIGIN??null}
const busKey=Symbol.for('uno.room.events');
const presenceKey=Symbol.for('uno.room.presence');
type Presence={seen:number;sockets:number};
const globals=globalThis as typeof globalThis&{[busKey]?:EventTarget;[presenceKey]?:Map<string,Map<string,Presence>>};
export function roomEvents(){return globals[busKey]??=new EventTarget()}
function presence(code:string){const rooms=globals[presenceKey]??=new Map();if(!rooms.has(code))rooms.set(code,new Map());return rooms.get(code)!}
export async function notifyRoomChanged(code:string){roomEvents().dispatchEvent(new CustomEvent('room',{detail:code}))}
export async function getRoomPresence(code:string){return [...presence(code)].filter(([,p])=>Date.now()-p.seen<35000).map(([hash])=>hash)}
export async function markRoomPresence(code:string,hash:string,socketDelta=0){const map=presence(code),old=map.get(hash),was=!!old&&Date.now()-old.seen<35000;const p={seen:Date.now(),sockets:Math.max(0,(old?.sockets??0)+socketDelta)};if(socketDelta<0&&p.sockets===0)p.seen=0;map.set(hash,p);const now=Date.now()-p.seen<35000;if(now!==was)await notifyRoomChanged(code)}
