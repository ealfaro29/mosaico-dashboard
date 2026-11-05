/* NODE_PATH=/tmp/mosaico-qa/node_modules node tests/frame-fullscreen.cjs */
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const results=[];
let browser,base;
const server=http.createServer(async(req,res)=>{
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
 res.end(await fs.readFile(path.join(root,'frame.html')));
});
async function pageFor(mode){
 const context=await browser.newContext({viewport:{width:1024,height:640}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(mode!=='native')await context.addInitScript(mode=>{
  const root=Element.prototype;
  let state=false,requests=0,exits=0;
  window.fullscreenQA=()=>({state,requests,exits});
  Object.defineProperty(document,'fullscreenElement',{configurable:true,get(){return mode==='standard'&&state?document.documentElement:null;}});
  Object.defineProperty(document,'webkitFullscreenElement',{configurable:true,get(){return mode==='webkit'&&state?document.documentElement:null;}});
  Object.defineProperty(document,'webkitCurrentFullScreenElement',{configurable:true,value:null});
  Object.defineProperty(document,'webkitIsFullScreen',{configurable:true,get(){return mode==='webkit-legacy'&&state;}});
  const change=()=>document.dispatchEvent(new Event(mode==='standard'?'fullscreenchange':'webkitfullscreenchange'));
  const request=function(){
   requests++;
   if(mode==='reject')return Promise.reject(new Error('Controlled denial'));
   if(mode==='throw')throw new Error('Controlled throw');
   if(mode==='no-event')return;
   state=true;change();
   if(mode==='standard')return Promise.resolve();
  };
  const exit=function(){exits++;state=false;change();if(mode==='standard')return Promise.resolve();};
  Object.defineProperty(root,'requestFullscreen',{configurable:true,value:['standard','reject','throw','no-event'].includes(mode)?request:undefined});
  Object.defineProperty(root,'webkitRequestFullscreen',{configurable:true,value:mode==='webkit'?request:undefined});
  Object.defineProperty(root,'webkitRequestFullScreen',{configurable:true,value:mode==='webkit-legacy'?request:undefined});
  Object.defineProperty(document,'exitFullscreen',{configurable:true,value:mode==='standard'?exit:undefined});
  Object.defineProperty(document,'webkitExitFullscreen',{configurable:true,value:mode==='webkit'?exit:undefined});
  Object.defineProperty(document,'webkitCancelFullScreen',{configurable:true,value:mode==='webkit-legacy'?exit:undefined});
 },mode);
 await page.goto(base+'/frame.html?offline=1');
 assert.deepEqual(errors,[]);
 return {context,page,errors};
}
async function test(name,fn){await fn();results.push({name,pass:true});console.log('PASS '+name);}
(async()=>{
 await fs.mkdir(path.join(root,'.qa'),{recursive:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const mode of ['standard','webkit','webkit-legacy']){
  await test(mode+' fullscreen waits for gesture and follows entry/exit state',async()=>{
   const t=await pageFor(mode);
   assert.deepEqual(await t.page.evaluate(()=>fullscreenQA()),{state:false,requests:0,exits:0});
   await t.page.locator('#frame-fullscreen').click();
   assert.equal(await t.page.locator('#frame-fullscreen').getAttribute('aria-pressed'),'true');
   assert.match(await t.page.locator('#frame-fullscreen').getAttribute('aria-label'),/^Salir/);
   assert.match(await t.page.locator('#frame-fullscreen-status').textContent(),/activada/);
   await t.page.locator('#frame-fullscreen').click();
   assert.equal(await t.page.locator('#frame-fullscreen').getAttribute('aria-pressed'),'false');
   assert.deepEqual(await t.page.evaluate(()=>fullscreenQA()),{state:false,requests:1,exits:1});
   assert.match(await t.page.locator('#frame-fullscreen-status').textContent(),/desactivada/);
   assert.deepEqual(t.errors,[]);await t.context.close();
  });
 }
 for(const mode of ['unsupported','reject','throw','no-event']){
  await test(mode+' never reports false success and offers browser fallback',async()=>{
   const t=await pageFor(mode);await t.page.locator('#frame-fullscreen').click();
   await t.page.waitForFunction(()=>document.getElementById('frame-fullscreen-status').textContent==='Usa la opción de pantalla completa del navegador.',{},{timeout:3000});
   assert.equal(await t.page.locator('#frame-fullscreen').getAttribute('aria-pressed'),'false');
   assert.equal(await t.page.locator('#frame-fullscreen').isEnabled(),true);
   assert.deepEqual(t.errors,[]);await t.context.close();
  });
 }
 await test('native Chrome click enters and exits actual fullscreen',async()=>{
  const t=await pageFor('native');
  assert.equal(await t.page.evaluate(()=>!!document.fullscreenElement),false);
  await t.page.locator('#frame-fullscreen').click();
  await t.page.waitForFunction(()=>!!document.fullscreenElement);
  assert.equal(await t.page.locator('#frame-fullscreen').getAttribute('aria-pressed'),'true');
  await t.page.locator('#frame-fullscreen').click();
  await t.page.waitForFunction(()=>!document.fullscreenElement);
  assert.equal(await t.page.locator('#frame-fullscreen').getAttribute('aria-pressed'),'false');
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 const output={browser:await browser.version(),passed:results.length,tests:results,scope:'Native Chrome plus simulated standard/WebKit support and failures; physical Fulguris not tested.'};
 await fs.writeFile(path.join(root,'.qa/frame-fullscreen-results.json'),JSON.stringify(output,null,2));
 console.log(JSON.stringify({passed:results.length}));
})().catch(e=>{console.error(e);process.exitCode=1;})
.finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});
