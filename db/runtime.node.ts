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
