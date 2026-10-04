import './sites-env.mjs';
import {spawnSync} from 'node:child_process';
import {networkInterfaces} from 'node:os';
import {isIP} from 'node:net';
import {existsSync} from 'node:fs';

const port=Number(process.env.UNO_PORT||3000);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('UNO_PORT must be between 1024 and 65535.');
const interfaces=Object.entries(networkInterfaces()).flatMap(([name,addresses])=>(addresses||[]).filter(a=>a.family==='IPv4'&&!a.internal).map(a=>({name,address:a.address})));
const privateIp=ip=>/^10\./.test(ip)||/^192\.168\./.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip);
const candidates=interfaces.filter(a=>privateIp(a.address)&&!/vpn|zerotier|tailscale|vethernet|vmware|virtualbox|docker|wsl|meta/i.test(a.name)).sort((a,b)=>Number(/wi-?fi|wlan|无线/i.test(b.name))-Number(/wi-?fi|wlan|无线/i.test(a.name)));
const host=process.env.UNO_HOST||candidates[0]?.address||'127.0.0.1';
if(isIP(host)!==4||(!privateIp(host)&&host!=='127.0.0.1'))throw Error('UNO_HOST must be a local-network IPv4 address.');
const origin=`http://${host}:${port}`;
// A second double-click should open the existing table, not rebuild locked files.
try{const response=await fetch(`${origin}/api/connection`,{signal:AbortSignal.timeout(1500)});const info=await response.json();if(info.lanOrigin===origin){console.log(`UNO is already running / 牌桌已运行：${origin}`);process.exit(0)}}catch{}
if(!existsSync('node_modules/vinext'))throw Error('Run npm ci once before starting the table.');
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1)}
if(!process.argv.includes('--no-build'))run(['scripts/run-framework.mjs','build']);
if(!existsSync('dist/server/wrangler.json'))throw Error('Run npm run build first.');
const cli=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js'];
const config=['--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state'];
run([...cli,'d1','execute','DB',...config,'--command','CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, expires INTEGER NOT NULL);']);
console.log(`\nUNO CLUB — same Wi-Fi / 同一 Wi-Fi\nOpen on all four devices / 四台设备打开：${origin}\nClassic: ${origin}/\nFLIP: ${origin}/flip\nFLEX: ${origin}/flex\nKeep this computer awake. Press Ctrl+C to stop.\n`);
if(host==='127.0.0.1')console.log('No Wi-Fi/Ethernet address found. Connect to Wi-Fi, or set UNO_HOST to your LAN IPv4 address.');
run([...cli,'dev',...config,'--ip',host,'--port',String(port),'--inspector-port','0','--var',`UNO_LAN_ORIGIN:${origin}`]);
