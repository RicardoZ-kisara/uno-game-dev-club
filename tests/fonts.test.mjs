import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const manifest=JSON.parse(await readFile(new URL('../public/fonts/sources.json',import.meta.url),'utf8'));
let assets=0;
for(const source of manifest)for(const asset of source.assets){
 const bytes=await readFile(new URL('../public/fonts/'+asset.file,import.meta.url));
 assert.equal(bytes.length,asset.bytes,asset.file);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.file);
 assets++;
}
const {chromium}=await import(process.env.UNO_PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,...(process.env.UNO_CHROME_PATH?{executablePath:process.env.UNO_CHROME_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[];
 page.on('request',r=>{if(r.url().includes('.woff2'))requests.push(r.url())});
 const base=process.env.UNO_TEST_URL??'http://127.0.0.1:5173';
 await page.goto(base,{waitUntil:'networkidle'});
 const checks=await page.evaluate(async()=>{
  const samples=[['UNO Sans','UNO CLUB'],['UNO CJK','准备摸牌排名赛掉线'],['UNO Mono','+123 VICTORY']];
  for(const [family,sample]of samples){
   const loaded=await document.fonts.load(`700 16px "${family}"`,sample);
   if(!loaded.length||loaded.some(f=>f.status!=='loaded'))throw Error(`Font failed: ${family}`);
  }
  await document.fonts.ready;
  return {families:samples.map(([family,sample])=>({family,loaded:document.fonts.check(`700 16px "${family}"`,sample)})),body:getComputedStyle(document.body).fontFamily};
 });
 assert(checks.families.every(f=>f.loaded));
 assert(checks.body.includes('UNO Sans')&&checks.body.includes('UNO CJK'));
 assert(requests.length>0);
 assert(requests.every(url=>new URL(url).origin===new URL(base).origin));
 const report={assetsVerified:assets,...checks,fontRequests:requests.length,allFontsSameOrigin:true};
 await writeFile('qa-fonts.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await browser.close()}
