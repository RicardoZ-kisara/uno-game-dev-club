"use client";
import {useEffect,useRef,type RefObject} from 'react';

export function useRoomSync<T extends {code:string;revision:number;viewer:number}>(code:string|undefined,token:RefObject<string>,current:RefObject<T|null>,receive:(room:T)=>void,connection:(connected:boolean)=>void){
 const callbacks=useRef({receive,connection});
 useEffect(()=>{callbacks.current={receive,connection}},[receive,connection]);
 useEffect(()=>{
  if(!code)return;
  let active=true,socket:WebSocket|undefined,healthy=false,failures=0,polling=false;
  let reconnect:ReturnType<typeof setTimeout>|undefined,poll:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
  let controller:AbortController|undefined;
  function accept(room:T){if(!active||room.code!==code)return;const old=current.current;if(old?.code===code&&room.revision<old.revision)return;callbacks.current.receive(room);callbacks.current.connection(true)}
  async function fallback(){
   clearTimeout(poll);if(!active||healthy||document.hidden||polling)return;polling=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),8000);
   try{const response=await fetch(`/api/room?code=${code}`,{headers:{Authorization:`Bearer ${token.current}`},cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Sync failed');accept(await response.json() as T)}catch{if(active&&!healthy)callbacks.current.connection(false)}
   finally{clearTimeout(timeout);polling=false;if(active&&!healthy&&!document.hidden)poll=setTimeout(fallback,Math.min(15000,1500*2**Math.min(failures,3)))}
  }
  function open(){
   clearTimeout(reconnect);if(!active||document.hidden)return;
   const u=new URL('/api/room/socket',location.href);u.protocol=location.protocol==='https:'?'wss:':'ws:';u.searchParams.set('code',code!);
   const ws=new WebSocket(u);socket=ws;healthy=false;
   function arm(){clearTimeout(deadline);deadline=setTimeout(()=>ws.close(4000,'Heartbeat expired'),35000)}
   ws.onopen=()=>{ws.send(JSON.stringify({type:'subscribe',token:token.current}));arm();heartbeat=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping'}))},20000)};
   ws.onmessage=e=>{if(!active||socket!==ws)return;try{const m=JSON.parse(e.data);if(m.type==='room'){healthy=true;failures=0;clearTimeout(poll);controller?.abort();accept(m.room)}if(m.type==='room'||m.type==='pong')arm()}catch{ws.close(4400,'Invalid snapshot')}};
   ws.onerror=()=>ws.close();
   ws.onclose=()=>{if(socket!==ws)return;healthy=false;clearInterval(heartbeat);clearTimeout(deadline);if(!active||document.hidden)return;failures++;callbacks.current.connection(false);void fallback();reconnect=setTimeout(open,Math.min(15000,500*2**Math.min(failures,5)))};
   deadline=setTimeout(()=>ws.close(),8000);
  }
  function wake(){clearTimeout(poll);clearTimeout(reconnect);if(document.hidden){healthy=false;socket?.close();controller?.abort();return}if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({type:'resync'}));return}socket?.close();open()}
  document.addEventListener('visibilitychange',wake);window.addEventListener('online',wake);window.addEventListener('focus',wake);open();
  return()=>{active=false;clearTimeout(reconnect);clearTimeout(poll);clearTimeout(deadline);clearInterval(heartbeat);controller?.abort();socket?.close();document.removeEventListener('visibilitychange',wake);window.removeEventListener('online',wake);window.removeEventListener('focus',wake)};
 },[code,token,current]);
}
