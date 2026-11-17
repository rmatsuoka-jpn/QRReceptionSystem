/* Run with: node --test tests/tab-guard.test.js */
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"..","app-tab-guard.js"),"utf8");

function setup(locks){
 const listeners=new Map(),intervals=[];
 const window={addEventListener(name,callback){listeners.set(name,callback);}};
 vm.runInNewContext(code,{window,navigator:locks?{locks}:{},setInterval:fn=>intervals.push(fn),console});
 return {guard:window.QRTabGuard,listeners,intervals};
}
async function flush(){for(let n=0;n<8;n++)await Promise.resolve();}

test("only one tab may edit and the waiting tab takes over after close",async()=>{
 let held=false;
 const locks={request(_name,options,callback){
  assert.equal(options.mode,"exclusive");
  assert.equal(options.ifAvailable,true);
  const grant=!held;
  if(grant)held=true;
  return Promise.resolve().then(()=>callback(grant?{}:null)).finally(()=>{if(grant)held=false;});
 }};
 const first=setup(locks),second=setup(locks);
 first.guard.start();second.guard.start();await flush();
 assert.equal(first.guard.status(),"owner");
 assert.equal(second.guard.status(),"readonly");
 assert.equal(second.guard.isOwner(),false);
 first.listeners.get("pagehide")();
 await flush();
 second.intervals[0]();await flush();
 assert.equal(second.guard.status(),"owner");
 assert.equal(second.guard.isOwner(),true);
});
test("editing stays blocked when Web Locks API is missing",()=>{
 const page=setup(null);
 page.guard.start();
 assert.equal(page.guard.status(),"unsupported");
 assert.equal(page.guard.isOwner(),false);
});
test("editing stays blocked if the browser denies a lock",async()=>{
 const page=setup({request(){return Promise.reject(new Error("SecurityError"));}});
 page.guard.start();await flush();
 assert.equal(page.guard.status(),"unsupported");
 assert.equal(page.guard.isOwner(),false);
});
test("synchronous lock errors also fail closed",()=>{
 const page=setup({request(){throw new Error("SecurityError");}});
 page.guard.start();
 assert.equal(page.guard.status(),"unsupported");
 assert.equal(page.guard.isOwner(),false);
});
