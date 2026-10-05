import assert from 'node:assert/strict';
import {isAllowedSocketOrigin} from '../scripts/websocket-server.mjs';
const request=origin=>({headers:{host:'127.0.0.1:3000',origin,'x-forwarded-proto':'https','x-forwarded-host':'attacker.test'},socket:{encrypted:false}});
assert.equal(isAllowedSocketOrigin(request('https://uno.example'),'https://uno.example'),true,'explicit HTTPS reverse proxy origin is accepted');
assert.equal(isAllowedSocketOrigin(request('http://127.0.0.1:3000'),'https://uno.example'),true,'direct LAN host is accepted');
assert.equal(isAllowedSocketOrigin(request('https://attacker.test'),'https://uno.example'),false,'forwarded headers cannot grant access');
assert.equal(isAllowedSocketOrigin(request('https://uno.example.attacker.test'),'https://uno.example'),false,'public origin comparison is exact');
console.log('WS reverse proxy origin checks passed');
