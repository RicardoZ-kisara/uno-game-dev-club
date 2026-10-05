import {getRoomDatabase as db,notifyRoomChanged} from '@uno/runtime';
export async function readRoom(code:string){return await db().prepare('SELECT data, version, expires FROM rooms WHERE code = ?').bind(code).first<{data:string;version:number;expires:number}>()}
export async function insertRoom(code:string,data:string,expires:number){const result=await db().prepare('INSERT INTO rooms (code,data,version,expires) VALUES (?,?,1,?)').bind(code,data,expires).run();await notifyRoomChanged(code);return result}
export async function saveRoom(code:string,data:string,version:number){const r=await db().prepare('UPDATE rooms SET data = ?, version = version + 1 WHERE code = ? AND version = ?').bind(data,code,version).run();if(r.meta.changes===1)await notifyRoomChanged(code);return r.meta.changes===1}
