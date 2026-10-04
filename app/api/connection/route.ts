import {getLanOrigin} from '@uno/runtime';
export const dynamic='force-dynamic';
export function GET(){
 return Response.json({lanOrigin:getLanOrigin()},{headers:{'Cache-Control':'no-store'}});
}
