import {env} from 'cloudflare:workers';
import type {RoomDatabase} from './runtime-types';
export function getRoomDatabase():RoomDatabase{if(!env.DB)throw Error('房间服务暂未就绪');return env.DB}
export function getLanOrigin(){const value=(env as unknown as Record<string,unknown>).UNO_LAN_ORIGIN;return typeof value==='string'?value:null}
