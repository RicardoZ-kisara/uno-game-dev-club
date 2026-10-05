import {env} from 'cloudflare:workers';
import type {RoomDatabase} from './runtime-types';
export function getRoomDatabase():RoomDatabase{if(!env.DB)throw Error('房间服务暂未就绪');return env.DB}
export function getLanOrigin(){const value=(env as unknown as Record<string,unknown>).UNO_LAN_ORIGIN;return typeof value==='string'?value:null}
function stream(code:string){if(!env.ROOM_STREAM)throw Error('房间实时服务暂未就绪');return env.ROOM_STREAM.get(env.ROOM_STREAM.idFromName(code))}
export async function notifyRoomChanged(code:string){try{await stream(code).fetch('https://room.internal/notify?code='+code,{method:'POST'})}catch{/* Persisted mutations remain successful; reconnect reads the latest snapshot. */}}
export async function getRoomPresence(code:string):Promise<string[]>{try{return await(await stream(code).fetch('https://room.internal/presence?code='+code)).json() as string[]}catch{return []}}
export async function markRoomPresence(code:string,hash:string){await stream(code).fetch('https://room.internal/touch?code='+code,{method:'POST',body:hash})}
