/* Same-browser tab ownership guard. Lock acquisition is asynchronous and fail-closed.
   The browser manages the lifetime of an exclusive Web Lock. */
(()=>{
 "use strict";
 const LOCK_NAME="QRReceptionSystem:editor:v1";
 let status="checking",started=false,attempting=false,releaseLock=null,stopped=false;
 const handlers=new Set();
 function update(next){
  if(status===next)return;
  status=next;
  for(const handler of handlers){try{handler(next);}catch(err){console.error("QR tab guard listener:",err);}}
 }
 function tryAcquire(){
  if(stopped||attempting||status==="owner")return;
  if(!navigator.locks||typeof navigator.locks.request!=="function"){
   update("unsupported");return;
  }
  attempting=true;
  try{
   Promise.resolve(navigator.locks.request(LOCK_NAME,{mode:"exclusive",ifAvailable:true},lock=>{
    attempting=false;
    if(stopped)return;
    if(!lock){update("readonly");return;}
    return new Promise(resolve=>{
     releaseLock=resolve;
     update("owner");
    });
   })).catch(err=>{
    attempting=false;
    if(!stopped){console.warn("QR tab guard: Web Locks unavailable",err);update("unsupported");}
   });
  }catch(err){
   attempting=false;
   console.warn("QR tab guard: Web Locks unavailable",err);
   update("unsupported");
  }
 }
 function onPageHide(){
  stopped=true;
  if(releaseLock){const finish=releaseLock;releaseLock=null;finish();}
  update("checking");
 }
 function start(){
  if(started)return;
  started=true;
  tryAcquire();
  setInterval(()=>{if(!stopped&&status!=="owner"&&status!=="unsupported")tryAcquire();},1500);
  window.addEventListener("pagehide",onPageHide);
  window.addEventListener("pageshow",event=>{
   if(!event.persisted)return;
   stopped=false;
   update("checking");
   tryAcquire();
  });
 }
 window.QRTabGuard={
  start,tryAcquire,
  status:()=>status,
  isOwner:()=>status==="owner",
  onChange:handler=>{handlers.add(handler);return ()=>handlers.delete(handler);}
 };
})();
