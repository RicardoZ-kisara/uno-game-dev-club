import {env} from 'cloudflare:workers';
export function GET(){
 const configured=(env as unknown as Record<string,unknown>).UNO_LAN_ORIGIN;
 return Response.json({lanOrigin:typeof configured==='string'?configured:null},{headers:{'Cache-Control':'no-store'}});
}
