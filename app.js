/* QR受付システム: static offline browser app, v1 */
(()=>{"use strict";
const $=id=>document.getElementById(id), IX="QRReception:index:v1", PREFIX="QRReception:event:v1:", META="QRReception:meta:v1", STORAGE_BUDGET=5000000;
let meta={},audioCtx=null;
let participantPage=1,participantPageSize=25,participantActiveEvent=null,participantImportEvent=null;
const SCHEMA=1, db=new Map();let order=[],activeId=null,view="home",homeTab="events",prepTab="settings",day=false,qrRendered="",lastScan="",lastScanAt=0,dialogReturnFocus=null,receptionTab="pending";
const esc=x=>String(x??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
const clone=x=>JSON.parse(JSON.stringify(x));
const catName=x=>({training:"研修",briefing:"説明会",other:"その他"}[x]||"その他");
const iso=()=>new Date().toISOString();
function localDate(s){if(!s)return "—";const t=new Date(s);return Number.isNaN(t.getTime())?"—":new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(t);}
function randomHex(n=12){if(!globalThis.crypto?.getRandomValues)throw Error("安全な乱数生成が利用できません。このブラウザを確認してください。");const b=new Uint8Array(n);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");}
function eventId(){let id;do{id="EVT-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+randomHex(4).toUpperCase();}while(db.has(id));return id;}
function sessionId(){return "S-"+randomHex(5);}
let noticeTimer=null;
/* 通知は画面下のトーストで表示。成功・案内は数秒で自動的に消え、警告・エラーは✕で閉じるまで残す。 */
function announce(msg,type=""){const n=$("notice");clearTimeout(noticeTimer);if(!msg){n.hidden=true;n.replaceChildren();return;}
 const text=document.createElement("span");text.className="notice-text";text.textContent=msg;
 const close=document.createElement("button");close.type="button";close.className="notice-close";close.setAttribute("aria-label","通知を閉じる");close.textContent="✕";close.onclick=()=>announce("");
 n.replaceChildren(text,close);n.className="notice "+type;n.hidden=false;
 if(type!=="error"&&type!=="warn")noticeTimer=setTimeout(()=>{n.hidden=true;},type==="success"?4500:6000);}
function key(id){return PREFIX+id;}
function loadAll(){try{const index=JSON.parse(localStorage.getItem(IX)||'{"ids":[]}');if(!Array.isArray(index.ids))throw Error("イベント一覧の形式が正しくありません");order=[...new Set(index.ids.filter(x=>typeof x==="string"))];const missing=[];for(const id of order){try{const raw=localStorage.getItem(key(id));if(!raw){missing.push(id);continue;}const event=JSON.parse(raw);validateEvent(event);if(event.id!==id)throw Error("イベントIDが一致しません");db.set(id,event);}catch(err){missing.push(id);}}if(missing.length)announce("一部の保存データを読み込めませんでした："+missing.join("、")+"。既存データは自動削除していません。","error");}catch(err){announce("保存済みデータを読み込めません："+err.message+"。復元用JSONがある場合は保管してください。","error");}}
/* Staff numbers: half-width letters/digits (no hyphen). Full-width input is converted; matching ignores case. */
const STAFF_RE=/^[A-Za-z0-9]+$/;
function normStaff(v){return String(v??"").normalize("NFKC").trim();}
function staffKey(v){return normStaff(v).toLowerCase();}
function validStaff(v){return STAFF_RE.test(v||"");}
function validateEvent(e){if(!e||typeof e!=="object"||typeof e.id!=="string"||!/^EVT-[A-Za-z0-9-]+$/.test(e.id)||typeof e.name!=="string"||!e.name||!Array.isArray(e.sessions)||!e.sessions.length||!Array.isArray(e.participants)||!Number.isInteger(e.nextParticipant)||e.nextParticipant<1)throw Error("イベントの構造が正しくありません");const ss=new Set();for(const s of e.sessions){if(!s||typeof s.id!=="string"||typeof s.name!=="string"||!s.name||ss.has(s.id))throw Error("受付区分が不正です");ss.add(s.id);}const ids=new Set(),staffIds=new Set();for(const p of e.participants){if(!p||typeof p.id!=="string"||typeof p.name!=="string"||!p.name||!p.planned||!p.checkins||ids.has(p.id))throw Error("参加者情報が不正です");ids.add(p.id);if(!p.removed&&p.staffId){if(typeof p.staffId!=="string"||!validStaff(p.staffId)||staffIds.has(staffKey(p.staffId)))throw Error("職員番号が不正または重複しています");staffIds.add(staffKey(p.staffId));}}}
function writeEvent(e){validateEvent(e);try{localStorage.setItem(key(e.id),JSON.stringify(e));db.set(e.id,e);markChanged();return true;}catch(err){if(isQuota(err))return announce(QUOTA_MSG,"error"),false;announce("保存できませんでした。操作は確定していません："+err.message,"error");return false;}}
function writeIndex(ids){try{localStorage.setItem(IX,JSON.stringify({version:SCHEMA,ids}));order=ids;markChanged();return true;}catch(err){if(isQuota(err))return announce(QUOTA_MSG,"error"),false;announce("イベント一覧を保存できません："+err.message,"error");return false;}}
/* Backup reminder, storage usage and reception feedback (sound/flash). Meta is app-owned UI state, never event data. */
const QUOTA_MSG="ブラウザの保存容量が上限に達したため保存できませんでした（操作は確定していません）。全イベントJSONをバックアップし、終了したイベントを削除してから再度操作してください。";
function isQuota(err){return err&&(err.name==="QuotaExceededError"||err.name==="NS_ERROR_DOM_QUOTA_REACHED"||err.code===22||err.code===1014);}
function loadMeta(){try{const m=JSON.parse(localStorage.getItem(META)||"{}");meta=m&&typeof m==="object"&&!Array.isArray(m)?m:{};}catch{meta={};}}
function saveMeta(){try{localStorage.setItem(META,JSON.stringify(meta));}catch{}}
function operatingMode(){return meta.operatingMode==="worker"?"worker":"master";}
function isMaster(){return operatingMode()==="master";}
function deviceId(){
 if(!meta.deviceId){meta.deviceId="PC-"+randomHex(8).toUpperCase();saveMeta();}
 return meta.deviceId;
}
function localSyncRevision(id){return Number(meta.syncRevisions?.[id]||0);}
function bumpSyncRevision(id){
 meta.syncRevisions||={};meta.syncRevisions[id]=localSyncRevision(id)+1;saveMeta();
}
function checkMaster(action="この操作"){
 if(isMaster())return true;
 announce(action+"はマスターPCモードで行ってください。","warn");return false;
}
function attendanceEpoch(e){return e.attendanceEpoch||"legacy:"+e.id;}
function applyOperatingModeUI(){
 const select=$("operatingMode");if(select)select.value=operatingMode();
 document.body.dataset.operatingMode=operatingMode();
 const state=$("operatingModeState");if(state)state.textContent=isMaster()?"マスターPC":"受付PC";
}

function markChanged(){meta.lastChangeAt=iso();saveMeta();renderBackupStatus();}
function needsBackup(){return db.size>0&&(!meta.lastBackupAt||(!!meta.lastChangeAt&&meta.lastChangeAt>meta.lastBackupAt));}
function storageInfo(){let n=0;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)||"";n+=k.length+(localStorage.getItem(k)||"").length;}}catch{}return {kb:Math.ceil(n*2/1024),pct:Math.min(100,Math.round(n/STORAGE_BUDGET*100))};}
function renderBackupStatus(){
 const b=$("backupStatus"),need=needsBackup(),last=meta.lastBackupAt?localDate(meta.lastBackupAt):"";
 if(b){b.hidden=!db.size;b.classList.toggle("warn",need);b.textContent=need?"⚠ 未バックアップの変更あり":"✓ バックアップ済み";b.title=(last?"最終バックアップ："+last:"まだバックアップしていません")+"\nクリックで全イベントJSONを保存します";}
 const l=$("lastBackup");if(l){l.textContent=last?"最終バックアップ："+last+(need?"（その後に変更あり）":""):"まだバックアップしていません";l.className=need&&db.size?"notice warn":"hint";}
 const st=storageInfo(),u=$("storageUsage");if(u)u.textContent="保存容量の目安：約"+st.pct+"%（"+st.kb.toLocaleString("ja-JP")+" KB）";
 const w=$("storageWarn");if(w){w.hidden=st.pct<70;w.textContent="ブラウザの保存容量が約"+st.pct+"%に達しています。全イベントJSONをバックアップし、終了したイベントの削除を検討してください。";}
}
function primeAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audioCtx||=new C();if(audioCtx.state==="suspended")audioCtx.resume();}catch{}}
function tone(freq,start,dur,type="sine",vol=.25){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(Math.max(.0002,vol),start+.015);g.gain.exponentialRampToValueAtTime(.0001,start+dur);o.connect(g).connect(audioCtx.destination);o.start(start);o.stop(start+dur+.05);}
const VOLUME={high:1,mid:.55,low:.25};
function feedback(level){if(meta.sound===false||!audioCtx||audioCtx.state!=="running")return;try{const t=audioCtx.currentTime+.01,v=VOLUME[meta.volume||"high"]??1;
 if(level==="success"){tone(1319,t,.45,"triangle",.55*v);tone(1047,t+.32,.75,"triangle",.55*v);} // ピンポーン
 else if(level==="warn"){for(let i=0;i<3;i++)tone(784,t+i*.24,.17,"square",.18*v);} // ピピピッ
 else if(level==="error"){tone(196,t,.45,"sawtooth",.3*v);tone(196,t+.6,.45,"sawtooth",.3*v);} // ブーッ、ブーッ
}catch{}}
/* Guided preparation steps. Progress for QR issue / roster print is UI state kept in meta, not in event data. */
const STEPS=[
 {tab:"settings",label:"イベント設定",todo:"開催日と受付区分を確認して保存しましょう。"},
 {tab:"participants",label:"参加者登録",todo:"Excelの名簿を貼り付けるか、CSVで参加者を登録しましょう。"},
 {tab:"qr",label:"QR発行",todo:"QRを印刷（A4・10面）するか、ZIPで出力して参加者へ配布しましょう。"},
 {tab:"results",label:"紙名簿・出力",todo:"PC不調に備えて、紙の受付名簿を印刷しておきましょう。"}];
function markStep(eventId,step){meta.steps||={};meta.steps[eventId]={...(meta.steps[eventId]||{}),[step]:iso()};saveMeta();if(view==="event"&&!day)renderSteps();}
function stepStates(e){const m=meta.steps?.[e.id]||{},n=e.participants.filter(p=>!p.removed).length,q=eligibleQrPeople(e).length;return [
 {done:!!e.date,note:e.date||"開催日が未設定"},
 {done:n>0,note:n?n+"名 登録済み":"まだ登録なし"},
 {done:!!m.qr||(n>0&&q===0),note:m.qr?"発行済み":n&&!q?"対象者なし（職員番号なし）":"対象 "+q+"名"},
 {done:!!m.roster,note:m.roster?"名簿印刷済み":"紙名簿 未印刷"}];}
function nextStep(e){const st=stepStates(e),i=st.findIndex(s=>!s.done);return i<0?null:{...STEPS[i],index:i};}
function renderSteps(){const e=current();if(!e)return;const st=stepStates(e),nx=nextStep(e);
 STEPS.forEach((s,i)=>{const b=document.querySelector('#prepSteps [data-prep="'+s.tab+'"]');b.className=(s.tab===prepTab?"active ":"")+(st[i].done?"done":"")+(nx&&nx.index===i?" next":"");b.innerHTML='<span class="step-no">'+(st[i].done?"✓":i+1)+'</span><span class="step-text">'+esc(s.label)+'<small>'+esc(st[i].note)+'</small></span>';});
 const box=$("nextStep");box.replaceChildren();const text=document.createElement("div");
 if(!nx){box.className="next-step done";text.innerHTML='<strong>事前準備は完了です。</strong>開催当日は上部の「▣ 当日受付」に切り替えてください。';box.append(text);return;}
 box.className="next-step";const here=nx.tab===prepTab;
 text.innerHTML='<span class="next-label">次にやること</span><strong>'+"①②③④"[nx.index]+" "+esc(nx.label)+'</strong>　'+esc(nx.todo)+(here?'<small>（この画面で操作します）</small>':'');box.append(text);
 if(!here){const go=document.createElement("button");go.type="button";go.className="btn main";go.dataset.prep=nx.tab;go.textContent=nx.label+"へ →";box.append(go);}
}
function dayCheckState(){const e=current(),today=new Date().toLocaleDateString("ja-JP"),d=meta.dayCheck?.[e.id];return d&&d.date===today?d.items:[];}
function renderDayCheck(){const items=dayCheckState(),all=["session","camera","sound","paper"],ok=all.every(x=>items.includes(x));for(const c of document.querySelectorAll("[data-day-check]"))c.checked=items.includes(c.dataset.dayCheck);$("dayCheckSession").textContent=curSession()?.name||"";const st=$("dayCheckStatus");st.textContent=ok?"✓ 準備OK":"未確認 "+items.length+"/4";st.className="tag"+(ok?"":" warn");if(ok&&!$("dayCheck").dataset.userOpened)$("dayCheck").open=false;}
function saveDayCheck(){const e=current();meta.dayCheck||={};meta.dayCheck[e.id]={date:new Date().toLocaleDateString("ja-JP"),items:[...document.querySelectorAll("[data-day-check]:checked")].map(c=>c.dataset.dayCheck)};saveMeta();renderDayCheck();}
function mutate(fn){const old=db.get(activeId);if(!old)return false;const next=clone(old);try{fn(next)}catch(err){announce(err.message,"error");return false;}if(!writeEvent(next))return false;bumpSyncRevision(next.id);render({keepScroll:true});return true;}
function current(){return db.get(activeId);}
function curSession(){const e=current();return e?.sessions.find(s=>s.id===$("checkinSession").value)||e?.sessions[0];}
function checked(p,s){const c=p.checkins?.[s];return !!(c&&c.active!==false);}
function statusFor(e,p){const planned=e.sessions.filter(s=>p.planned[s.id]);const done=planned.filter(s=>checked(p,s.id));if(!planned.length)return "対象外";if(!done.length)return "未受付";return done.length===planned.length?"受付済み":"一部受付";}
function evCounts(e){let target=0,done=0;for(const p of e.participants.filter(p=>!p.removed)){for(const s of e.sessions){if(p.planned[s.id]){target++;if(checked(p,s.id))done++;}}}return {target,done,percent:target?Math.round(done/target*100):0};}
/* Clone event configuration with fresh session IDs; optionally copy the active roster, never check-in history. */
function makeEvent(from,copyParticipants=false){
 const id=eventId(),sessions=from?from.sessions.map(s=>({id:sessionId(),name:s.name})):[{id:sessionId(),name:"共通受付"}];
 const out={id,name:from?from.name+"（複製）":"新規イベント",date:"",category:from?.category||"training",sessions,customLabels:from?.customLabels?.slice(0,2)||["",""],customTypes:from?.customTypes?.slice(0,2)||["text","text"],customOptions:from?.customOptions?.map(opts=>opts.slice())||[[],[]],nextParticipant:1,participants:[],attendanceEpoch:"A-"+randomHex(8),createdAt:iso()};
 if(from&&copyParticipants){
  for(const p of from.participants.filter(x=>!x.removed)){
   const planned=Object.fromEntries(from.sessions.map((old,i)=>[sessions[i].id,p.planned?.[old.id]===true]));
   out.participants.push({
    id:String(out.nextParticipant++).padStart(4,"0"),name:p.name,staffId:p.staffId||"",
    department:p.department||"",group:p.group||"",customValues:[p.customValues?.[0]||"",p.customValues?.[1]||""],
    planned,checkins:{},source:"pre",removed:false
   });
  }
 }
 return out;
}
function addEvent(fromId){if(!checkMaster("イベント作成"))return;
 const choices=[...order].reverse().map(id=>db.get(id)).filter(Boolean);
 const box=document.createElement("div");box.className="ev-create-dialog";
 box.innerHTML=
  '<p class="hint" style="margin-top:0">既存のイベントから設定や参加者名簿を引用できます。新しいイベントIDを発行し、受付履歴・受付時刻は引き継ぎません。</p>'+
  '<label class="field">引用元イベント（任意）<select id="newEventCopySource"><option value="">引用せずに新規作成</option></select></label>'+
  '<div id="newEventCopyOptions" class="ev-copy-options" hidden>'+
   '<span class="ev-copy-heading">引き継ぐ内容</span>'+
   '<label class="check"><input type="radio" name="newEventCopyMode" value="settings"> 設定のみ（受付区分・追加項目）</label>'+
   '<label class="check"><input type="radio" name="newEventCopyMode" value="people"> 設定＋参加者名簿（氏名・職員番号・所属・グループ・追加項目・参加予定）</label>'+
   '<p id="newEventCopySummary" class="hint"></p>'+
  '</div>'+
  '<label class="field">イベント名（必須）<input id="newEventName" maxlength="200"></label>'+
  '<label class="field">開催日<input id="newEventDate" type="date"></label>'+
  '<label class="field">分類<select id="newEventCategory"><option value="training">研修</option><option value="briefing">説明会</option><option value="other">その他</option></select></label>'+
  '<div class="delete-dialog-buttons"><button type="button" class="btn" id="newEventCancel">キャンセル</button><button type="button" class="btn main" id="newEventCreate">作成して準備を始める →</button></div>';
 openDialog(fromId?"既存イベントをもとに新規作成":"新規イベントの作成",box);
 const select=$("newEventCopySource"),mode=box.querySelector('input[name="newEventCopyMode"][value="people"]'),
 settingsMode=box.querySelector('input[name="newEventCopyMode"][value="settings"]');
 for(const e of choices)select.add(new Option((e.date?e.date+" ｜ ":"")+e.name+"（"+e.participants.filter(p=>!p.removed).length+"名）",e.id));
 let lastAutoName="";
 const changeSource=()=>{
  const from=db.get(select.value),previousName=$("newEventName").value;
  $("newEventCopyOptions").hidden=!from;
  if(!from){if($("newEventName").value===lastAutoName)$("newEventName").value="";lastAutoName="";$("newEventCategory").value="training";return;}
  const auto=from.name+"（複製）";
  if(!previousName||previousName===lastAutoName)$("newEventName").value=auto;
  lastAutoName=auto;
  $("newEventCategory").value=from.category;
  const n=from.participants.filter(p=>!p.removed).length;
  $("newEventCopySummary").textContent=(mode.checked?n+"名の参加者をコピーします。":"参加者はコピーしません。")+
   " 受付履歴・時刻・当日受付のテスト結果はコピーしません。元のイベントは変更されません。";
 };
 select.value=fromId&&db.has(fromId)?fromId:"";
 if(select.value){settingsMode.checked=true;}else{mode.checked=true;}
 select.addEventListener("change",()=>{if(select.value)mode.checked=true;changeSource();});
 for(const radio of box.querySelectorAll('input[name="newEventCopyMode"]'))radio.addEventListener("change",changeSource);
 changeSource();
 if(!select.value)$("newEventName").focus();
 $("newEventCancel").onclick=closeDialog;
 const create=()=>{
  const name=$("newEventName").value.trim();
  if(!name){$("newEventName").focus();return announce("イベント名を入力してください。","warn");}
  const from=select.value?db.get(select.value):null;
  if(select.value&&!from)return announce("引用元イベントが見つかりません。選び直してください。","error");
  let e;try{e=makeEvent(from,!!from&&mode.checked);}catch(err){return announce("イベントを作成できません："+err.message,"error");}
  e.name=name;e.date=$("newEventDate").value;e.category=$("newEventCategory").value;
  try{validateEvent(e);}catch(err){return announce("複製した名簿に問題があります："+err.message,"error");}
  if(commitNewEvent(e))closeDialog();
 };
 $("newEventCreate").onclick=create;$("newEventName").onkeydown=ev=>{if(ev.key==="Enter"){ev.preventDefault();create();}};
}
function commitNewEvent(e){try{validateEvent(e);localStorage.setItem(key(e.id),JSON.stringify(e));if(!writeIndex([...order,e.id])){localStorage.removeItem(key(e.id));return false;}db.set(e.id,e);openEvent(e.id,false,"settings");announce("イベントを作成しました。受付区分と参加者名簿を確認してください。","success");return true;}catch(err){try{localStorage.removeItem(key(e.id));}catch{}announce("イベントを保存できません："+err.message,"error");return false;}}
function deleteEvent(id){if(!checkMaster("イベント削除"))return;const e=db.get(id);if(!e)return;if(!confirm("「"+e.name+"」を削除します。\n事前に全イベントJSONをバックアップしましたか？\n削除するとこのブラウザから名簿・受付履歴が消えます。"))return;if(!confirm("最終確認：イベント「"+e.name+"」を削除しますか？"))return;const next=order.filter(x=>x!==id);if(!writeIndex(next))return;try{localStorage.removeItem(key(id));db.delete(id);if(meta.steps?.[id]||meta.dayCheck?.[id]){delete meta.steps?.[id];delete meta.dayCheck?.[id];saveMeta();}if(activeId===id){activeId=null;view="home";}render();announce("イベントを削除しました。","warn");}catch(err){writeIndex([...next,id]);announce("削除に失敗しました："+err.message,"error");}}
function openEvent(id,goDay=false,tab){if(!db.has(id))return;if(!isMaster())goDay=true;if(!tab){const n=nextStep(db.get(id));tab=n?n.tab:"results";}activeId=id;view="event";day=goDay;prepTab=tab;receptionTab="pending";render();}
function openHome(tab="events"){view="home";homeTab=tab;render();}
function todayStr(){return new Date().toLocaleDateString("sv-SE");}
function nextBadge(e){const n=nextStep(e);return n?'<span class="tag warn">次：'+"①②③④"[n.index]+" "+esc(n.label)+'</span>':'<span class="tag">✓ 準備完了</span>';}
function summaryMetric(label,value){return '<div class="metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';}
/* ===== 総合管理（2026-11 B案）: 次のイベント／未開催・終了タブ／⋯メニュー ===== */
let listTab="upcoming",showOlderPast=false;
const WEEK="日月火水木金土";
function parseDay(d){const [y,m,dd]=String(d).split("-").map(Number);return new Date(y,m-1,dd);}
function dayDiff(d){return Math.round((parseDay(d)-parseDay(todayStr()))/86400000);}
function relLabel(n){return n===0?"今日":n===1?"明日":n===-1?"昨日":n>1?n+"日後":(-n)+"日前";}
function liveCount(e){return e.participants.filter(p=>!p.removed).length;}
function readyPill(e){const n=nextStep(e);return n?'<span class="hm-pill next">次：'+"①②③④"[n.index]+" "+esc(n.label)+'</span>':'<span class="hm-pill ok">✓ 準備完了</span>';}
function heroEvents(ev){const t=todayStr(),today=ev.filter(e=>e.date===t).sort((a,b)=>a.name.localeCompare(b.name,"ja"));if(today.length)return {today:true,list:today};const fut=ev.filter(e=>e.date&&e.date>t).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,"ja"));return {today:false,list:fut.length?fut.filter(e=>e.date===fut[0].date):[]};}
function renderHero(ev){const box=$("todayEvents"),h=heroEvents(ev);box.replaceChildren();box.hidden=!h.list.length;
 for(const e of h.list){const d=parseDay(e.date),x=evCounts(e),card=document.createElement("article");card.className="hm-hero"+(h.today?" today":"");
  const steps=stepStates(e).map((st,i)=>'<span class="hm-step'+(st.done?" done":"")+'"><i>'+(st.done?"✓":i+1)+'</i>'+esc(STEPS[i].label)+'</span>').join("");
  const body=h.today?'<div class="hm-bigprog"><div class="row"><span>受付進捗（全区分）</span><strong>'+x.done+' / '+x.target+'</strong></div><div class="progress"><div style="width:'+x.percent+'%"></div></div></div>':'<div class="hm-steps">'+steps+'</div>';
  const n=nextStep(e);
  const acts=!isMaster()?'<button type="button" class="btn main hm-big" data-action="day" data-id="'+esc(e.id)+'">▣ 受付画面を開く →</button>':h.today?'<button type="button" class="btn main hm-big" data-action="day" data-id="'+esc(e.id)+'">▣ 受付を開始 →</button><button type="button" class="btn" data-action="prep" data-id="'+esc(e.id)+'">⚙ 準備を確認</button>'
   :'<button type="button" class="btn main hm-big" data-action="prep" data-id="'+esc(e.id)+'">⚙ '+(n?"準備を続ける":"準備を確認")+'</button><button type="button" class="btn" data-action="results" data-id="'+esc(e.id)+'">▤ 紙名簿を印刷</button>';
  card.innerHTML='<div class="hm-dblock"><span class="m">'+(d.getMonth()+1)+'月</span><span class="d">'+d.getDate()+'</span><span class="w">（'+WEEK[d.getDay()]+'）</span></div><div class="hm-hero-body"><div class="hm-eyebrow">'+(h.today?'本日のイベント <span class="hm-pill today">今日</span>':'次のイベント <span class="hm-pill rel">'+relLabel(dayDiff(e.date))+'</span>')+'</div><h3>'+esc(e.name)+'</h3><div class="hm-meta">'+readyPill(e)+'<span>'+esc(catName(e.category))+'・'+liveCount(e)+'名 登録・'+e.sessions.length+'区分</span><span class="code">'+esc(e.id)+'</span></div>'+body+'</div><div class="hm-hero-acts">'+acts+'</div>';
  box.append(card);}
 return h;}
function renderHome(){const ev=[...db.values()];
 $("globalSummary").innerHTML='このPC：イベント<b>'+ev.length+'</b>件・延べ<b>'+ev.reduce((n,e)=>n+liveCount(e),0)+'</b>名';
 $("backupCount").textContent=ev.length+"イベントがバックアップ対象";$("firstGuide").hidden=ev.length>0;$("hmList").hidden=!ev.length;
 $("hmSearch").hidden=homeTab!=="events";
 for(const name of ["events","cross","data"]){$("home"+name[0].toUpperCase()+name.slice(1)).hidden=name!==homeTab;document.querySelector('[data-home="'+name+'"]')?.classList.toggle("active",name===homeTab);}
 if(homeTab==="events"){renderHero(ev);renderEventList();}if(homeTab==="cross")renderCross();}
function eventRow(e,past){const x=evCounts(e),row=document.createElement("article");row.className="hm-item"+(past?" past":"");
 let date='<div class="hm-sdate none"><span class="d">未設定</span></div>';
 if(e.date){const d=parseDay(e.date),y=d.getFullYear()!==new Date().getFullYear()?'<span class="y">'+d.getFullYear()+'</span>':'';date='<div class="hm-sdate">'+y+'<span class="d">'+(d.getMonth()+1)+'/'+d.getDate()+'</span><span class="w">'+WEEK[d.getDay()]+'</span></div>';}
 const n=nextStep(e),id=esc(e.id);
 const primary=!isMaster()?'<button type="button" class="btn main" data-action="day" data-id="'+id+'">▣ 受付画面</button>':past?'<button type="button" class="btn" data-action="results" data-id="'+id+'">▤ 結果・出力</button>':'<button type="button" class="btn'+(n?" main":"")+'" data-action="prep" data-id="'+id+'">⚙ '+(n?"準備を続ける":"準備を確認")+'</button>';
 row.innerHTML=date+'<div class="hm-main"><div class="hm-name">'+esc(e.name)+'</div><div class="hm-sub"><span class="hm-pill cat">'+esc(catName(e.category))+'</span><span>'+liveCount(e)+'名 登録・'+e.sessions.length+'区分</span>'+(past?'':readyPill(e))+'<span class="code">'+id+'</span></div></div><div class="hm-prog"><div class="row"><span>受付</span><span>'+(x.target?x.done+' / '+x.target:'—')+'</span></div><div class="progress"><div style="width:'+x.percent+'%"></div></div></div><div class="hm-acts">'+primary+'<button type="button" class="hm-more" data-menu="'+id+'" aria-haspopup="menu" aria-label="'+esc(e.name)+'のその他の操作">⋯</button></div>';
 return row;}
function renderEventList(){closeEventMenu();
 const q=$("eventQuery").value.trim().toLocaleLowerCase("ja-JP"),from=$("dateFrom").value,to=$("dateTo").value,k=$("sortKey").value,sign=$("sortOrder").value==="asc"?1:-1,root=$("eventCards"),t=todayStr();
 root.replaceChildren();
 const filtered=!!(q||from||to),custom=k!=="auto";$("sortOrder").disabled=!custom;$("filterDot").hidden=!(from||to||custom);
 for(const b of document.querySelectorAll("[data-list-tab]")){const on=b.dataset.listTab===listTab;b.classList.toggle("active",on);b.setAttribute("aria-selected",String(on));}
 if(from&&to&&from>to){$("eventCount").textContent="開始日と終了日を確認してください。";return;}
 const all=[...db.values()].filter(e=>(!q||e.name.toLocaleLowerCase("ja-JP").includes(q))&&(!from||(e.date&&e.date>=from))&&(!to||(e.date&&e.date<=to)));
 const upcoming=all.filter(e=>!e.date||e.date>=t),past=all.filter(e=>e.date&&e.date<t);
 $("countUpcoming").textContent=upcoming.length;$("countPast").textContent=past.length;
 $("eventCount").textContent=filtered||custom?"絞り込み中："+all.length+" / "+db.size+"件":"";
 const sorter=asc=>(a,b)=>{if(custom&&k==="id")return sign*a.id.localeCompare(b.id,"ja",{numeric:true});const s=custom?sign:(asc?1:-1);if(!a.date||!b.date)return !a.date&&!b.date?a.id.localeCompare(b.id):a.date?-1:1;return s*a.date.localeCompare(b.date)||a.name.localeCompare(b.name,"ja");};
 const group=(title,note,list,past)=>{if(!list.length)return;const h=document.createElement("div");h.className="hm-grp";h.innerHTML=esc(title)+(note?' <small>'+esc(note)+'</small>':'');const box=document.createElement("div");box.className="hm-list";for(const e of list)box.append(eventRow(e,past));root.append(h,box);return box;};
 const empty=msg=>{const p=document.createElement("div");p.className="hm-empty";p.textContent=msg;root.append(p);};
 if(listTab==="upcoming"){
  const heroIds=filtered?new Set():new Set(heroEvents([...db.values()]).list.map(e=>e.id));
  const dated=upcoming.filter(e=>e.date&&!heroIds.has(e.id)).sort(sorter(true)),undated=upcoming.filter(e=>!e.date).sort(sorter(true));
  const hid=upcoming.some(e=>heroIds.has(e.id));
  group("これから",(hid?"上のカード以外・":"")+(custom?"指定の順":"開催日が近い順"),dated,false);
  group("日付未設定","",undated,false);
  if(!dated.length&&!undated.length)empty(filtered?"条件に合う未開催のイベントはありません。":hid?"ほかに未開催のイベントはありません。":"未開催のイベントはありません。「＋ 新規イベント」から作成できます。");
 }else{
  const limit=new Date(parseDay(t).getTime()-30*86400000).toLocaleDateString("sv-SE");
  const sorted=past.sort(sorter(false)),recent=filtered||showOlderPast?sorted:sorted.filter(e=>e.date>=limit),older=sorted.length-recent.length;
  const box=group(filtered?"終了したイベント":showOlderPast?"すべての終了イベント":"直近30日",custom?"指定の順":"新しい順",recent,true);
  if(older>0){const more=document.createElement("button");more.type="button";more.className="hm-morebar";more.textContent="それより前のイベントを表示（"+older+"件）";more.onclick=()=>{showOlderPast=true;renderEventList();};(box||root).append(more);}
  if(!recent.length&&!older)empty(filtered?"条件に合う終了イベントはありません。":"終了したイベントはまだありません。");
 }}
function closeEventMenu(){const m=$("eventMenu");if(m&&!m.hidden){m.hidden=true;m.replaceChildren();document.querySelector("[data-menu][aria-expanded=true]")?.setAttribute("aria-expanded","false");}}
function openEventMenu(btn){const m=$("eventMenu"),id=btn.dataset.menu;if(!m.hidden&&m.dataset.for===id)return closeEventMenu();closeEventMenu();
 m.dataset.for=id;const e=db.get(id),past=e?.date&&e.date<todayStr();
 m.innerHTML='<button type="button" role="menuitem" data-action="day" data-id="'+esc(id)+'">▣ 受付画面</button>'+(past?'<button type="button" role="menuitem" data-action="prep" data-id="'+esc(id)+'">⚙ 準備画面</button>':'<button type="button" role="menuitem" data-action="results" data-id="'+esc(id)+'">▤ 紙名簿・出力</button>')+'<button type="button" role="menuitem" data-action="clone" data-id="'+esc(id)+'">⧉ 複製</button><button type="button" role="menuitem" class="del" data-action="delete" data-id="'+esc(id)+'">削除</button>';
 const r=btn.getBoundingClientRect();m.hidden=false;m.style.top=(window.scrollY+r.bottom+6)+"px";m.style.left=Math.max(8,window.scrollX+r.right-m.offsetWidth)+"px";btn.setAttribute("aria-expanded","true");m.querySelector("button")?.focus();}
function renderEvent(keepScroll=false){const e=current();if(!e)return openHome();$("eventTitle").textContent=e.name;$("eventSubtitle").innerHTML='<span>'+esc(e.date||"開催日未設定")+'</span><span class="hm-pill cat">'+esc(catName(e.category))+'</span><span class="code">'+esc(e.id)+'</span>';$("crumbEvent").textContent=e.name;$("rxEventName").textContent=e.name;$("crumbMode").textContent=day?"当日受付":"事前準備";$("prepView").hidden=day;$("receptionView").hidden=!day;for(const mode of ["prep","day"])document.querySelector('[data-mode="'+mode+'"]').classList.toggle("active",(mode==="day")===day);if(day){renderReception();return;}
for(const name of ["settings","participants","qr","results"]){$(name+"Panel").hidden=name!==prepTab;document.querySelector('[data-prep="'+name+'"]').classList.toggle("active",name===prepTab);}
if(prepTab==="settings")renderSettings();if(prepTab==="participants")renderParticipants();if(prepTab==="qr")renderQRSelect();if(prepTab==="results")renderResults();renderSteps();if(!keepScroll)window.scrollTo?.({top:0});}
function getCustomType(e,i){return e.customTypes?.[i]||"text";}
function getCustomOptions(e,i){return e.customOptions?.[i]||[];}
/* Consistent labels and readable values across participant views. */
function customColumnIndices(e){return [0,1].filter(i=>String(e.customLabels?.[i]||"").trim());}
function customDisplayValue(e,p,i){const v=String(p?.customValues?.[i]??"").trim();return getCustomType(e,i)==="bool"?(v==="有"?"はい":v==="無"?"いいえ":v):v;}
function customEntries(e,p){return customColumnIndices(e).map(i=>({index:i,label:String(e.customLabels[i]).trim(),value:customDisplayValue(e,p,i)})).filter(x=>x.value);}
function customSearchText(e,p){return customEntries(e,p).flatMap(x=>[x.label,x.value]).join(" ");}
function appendCustomDetails(root,e,p,cssClass){
 const fields=customEntries(e,p);
 for(const x of fields){const el=document.createElement("span");el.className=cssClass;el.textContent=x.label+"："+x.value;el.title=x.label+"："+x.value;root.append(el);}
 return fields.length;
}
function normalizeCustom(e,i,value){
 const v=String(value??"").trim(),type=getCustomType(e,i);
 if(!v)return "";
 if(type==="bool"){
  if(["有","あり","1","true","○","はい","yes"].includes(v.toLowerCase()))return "有";
  if(["無","なし","0","false","×","いいえ","no"].includes(v.toLowerCase()))return "無";
  throw Error((e.customLabels?.[i]||"追加項目"+(i+1))+" は「有」または「無」を選択してください");
 }
 if(type==="select"&&!getCustomOptions(e,i).includes(v))throw Error((e.customLabels?.[i]||"追加項目"+(i+1))+" の選択肢に「"+v+"」はありません");
 return v;
}
function toggleCustomOptions(i){$("customOptionsWrap"+i).hidden=$("customType"+i).value!=="select";}
function renderCustomPreview(){
 const e=current();if(!e)return;
 const root=$("customPreview");root.replaceChildren();
 const labels=[1,2].map(i=>$("customLabel"+i).value.trim());
 const types=[1,2].map(i=>$("customType"+i).value);
 const opts=[1,2].map(i=>$("customOptions"+i).value.split("|").map(v=>v.trim()).filter(Boolean));
 const saved=labels.every((v,i)=>v===(e.customLabels?.[i]||""))&&types.every((v,i)=>v===getCustomType(e,i))&&opts.every((v,i)=>JSON.stringify(v)===JSON.stringify(getCustomOptions(e,i)));
 const status=$("customSaveStatus");status.textContent=saved?"保存済み":"未保存";status.className="tag"+(saved?"":" unsaved");
 for(let i=0;i<2;i++){
  const el=document.createElement("div");el.className="custom-preview-field";
  const label=document.createElement("strong");label.textContent=labels[i]||"追加項目"+(i+1);
  const field=document.createElement("div");field.className="fake-input";
  field.textContent=types[i]==="bool"?"○ はい　／　○ いいえ":types[i]==="select"?(opts[i].join("　／　")||"選択肢を入力してください"):"自由入力";
  el.append(label,field);root.append(el);
 }
}

const SESSION_PRESETS=["共通受付","午前","午後","第1部","第2部","交流会"];
const CUSTOM_PRESETS=[{name:"参加形式",type:"select",options:["対面","オンライン"]},{name:"PC持参",type:"bool",options:[]},{name:"昼食希望",type:"bool",options:[]},{name:"希望分科会",type:"text",options:[]},{name:"備考",type:"text",options:[]}];
function pastEvents(){return [...order].reverse().filter(id=>id!==activeId).map(id=>db.get(id)).filter(Boolean);}
function recentSessions(){const seen=new Set(SESSION_PRESETS),out=[];for(const e of pastEvents())for(const s of e.sessions){const v=s.name.trim();if(v&&!seen.has(v)){seen.add(v);out.push(v);if(out.length===5)return out;}}return out;}
function recentCustom(){const seen=new Set(CUSTOM_PRESETS.map(p=>p.name)),out=[];for(const e of pastEvents())for(let i=0;i<2;i++){const name=(e.customLabels?.[i]||"").trim();if(name&&!seen.has(name)){seen.add(name);out.push({name,type:getCustomType(e,i),options:[...getCustomOptions(e,i)]});if(out.length===5)return out;}}return out;}
function emptyPreset(id){const x=document.createElement("span");x.className="es-no-history";x.textContent="まだ履歴はありません";$(id).append(x);}
function renderSessionPresets(){
 const used=new Set([...document.querySelectorAll("#sessionEditor [data-session-name]")].map(x=>x.value.trim()));for(const s of current().sessions)used.add(s.name);
 for(const [id,names] of [["sessionPresetButtons",SESSION_PRESETS],["sessionRecentButtons",recentSessions()]]){const root=$(id);root.replaceChildren();if(!names.length){emptyPreset(id);continue;}for(const name of names){const b=document.createElement("button");b.type="button";b.className="es-chip";b.textContent="＋ "+name;b.disabled=used.has(name);b.title=b.disabled?"登録済み":"このイベントに追加";b.onclick=()=>addSession(name);root.append(b);}}
}
function renderCustomPresets(){
 const used=new Set([1,2].map(i=>$("customLabel"+i).value.trim()).filter(Boolean)),full=[1,2].every(i=>$("customLabel"+i).value.trim());
 for(const [id,items] of [["customPresetButtons",CUSTOM_PRESETS],["customRecentButtons",recentCustom()]]){const root=$(id);root.replaceChildren();if(!items.length){emptyPreset(id);continue;}for(const p of items){const b=document.createElement("button");b.type="button";b.className="es-candidate";b.disabled=full||used.has(p.name);b.title=b.disabled?"設定済み、または空き枠がありません":"空欄に設定";const n=document.createElement("span");n.textContent="＋ "+p.name;const t=document.createElement("small");t.textContent=p.type==="bool"?"はい／いいえ":p.type==="select"?"選択式":"自由入力";b.append(n,t);b.onclick=()=>applyCustomPreset(p);root.append(b);}}
}
function applyCustomPreset(p){
 if([1,2].some(i=>$("customLabel"+i).value.trim()===p.name))return announce("同じ追加項目が設定されています。","warn");
 const i=[1,2].find(i=>!$("customLabel"+i).value.trim());if(!i)return announce("追加項目は最大2つです。クリアしてから選択してください。","warn");
 $("customLabel"+i).value=p.name;$("customType"+i).value=["bool","select"].includes(p.type)?p.type:"text";$("customOptions"+i).value=(p.options||[]).join("|");toggleCustomOptions(i);renderCustomPreview();renderCustomPresets();announce("「"+p.name+"」を設定しました。保存すると確定します。","success");
}
function clearCustomPreset(i){$("customLabel"+i).value="";$("customType"+i).value="text";$("customOptions"+i).value="";toggleCustomOptions(i);renderCustomPreview();renderCustomPresets();}
function settingsSnapshot(){return {n:$("editEventName").value,d:$("editEventDate").value,c:$("editEventCategory").value,ns:Object.fromEntries([...document.querySelectorAll("[data-session-name]")].map(x=>[x.dataset.sessionName,x.value])),add:$("newSessionName").value,custom:[1,2].map(i=>[$("customLabel"+i).value,$("customType"+i).value,$("customOptions"+i).value])};}
function restoreSettingsSnapshot(s){
 $("editEventName").value=s.n;$("editEventDate").value=s.d;$("editEventCategory").value=s.c;$("newSessionName").value=s.add;
 for(const x of document.querySelectorAll("[data-session-name]"))if(Object.hasOwn(s.ns,x.dataset.sessionName))x.value=s.ns[x.dataset.sessionName];
 for(let i=1;i<=2;i++){const [n,t,o]=s.custom[i-1];$("customLabel"+i).value=n;$("customType"+i).value=t;$("customOptions"+i).value=o;toggleCustomOptions(i);}
 renderCustomPreview();renderSessionPresets();renderCustomPresets();
}
function renderSettings(){
 $("sessionInlineStatus").hidden=true;
 const e=current();$("editEventName").value=e.name;$("editEventDate").value=e.date||"";$("editEventCategory").value=e.category;
 for(let i=0;i<2;i++){$("customLabel"+(i+1)).value=e.customLabels?.[i]||"";$("customType"+(i+1)).value=getCustomType(e,i);$("customOptions"+(i+1)).value=getCustomOptions(e,i).join("|");toggleCustomOptions(i+1);}
 renderCustomPreview();const root=$("sessionEditor");root.replaceChildren();
 e.sessions.forEach((s,i)=>{const line=document.createElement("div");line.className="session-row";line.innerHTML='<span class="tag">'+(i+1)+'</span><input aria-label="受付区分名" class="search" value="'+esc(s.name)+'" data-session-name="'+esc(s.id)+'"><button type="button" class="btn danger small" data-action="remove-session" data-session="'+esc(s.id)+'">削除</button>';root.append(line);});
 renderSessionPresets();renderCustomPresets();
}
function saveSettings(){if(!checkMaster("イベント設定"))return false;
 const name=$("editEventName").value.trim(),date=$("editEventDate").value;
 if(!name)return announce("イベント名は必須です。","warn");
 const names=[...document.querySelectorAll("[data-session-name]")].map(x=>x.value.trim());
 if(names.some(x=>!x)||new Set(names).size!==names.length)return announce("受付区分名を入力し、重複しないようにしてください。","warn");
 const types=[1,2].map(i=>$("customType"+i).value),options=[1,2].map(i=>$("customOptions"+i).value.split("|").map(x=>x.trim()).filter(Boolean));
 if(types.some((t,i)=>t==="select"&&(!options[i].length||new Set(options[i]).size!==options[i].length)))return announce("選択肢は「|」区切りで重複なく入力してください。","warn");
 if(mutate(e=>{
  e.name=name;e.date=date;e.category=$("editEventCategory").value;
  e.customLabels=[$("customLabel1").value.trim(),$("customLabel2").value.trim()];
  e.customTypes=types;e.customOptions=options;e.sessions.forEach((s,i)=>s.name=names[i]);
 })){announce("イベント設定を保存しました。","success");renderSteps();return true;}
 return false;
}
function sessionLocalFeedback(message,type="success",id=null){
 const note=$("sessionInlineStatus");if(!note)return;note.textContent=message;note.hidden=false;note.className="es-session-inline-status "+type;
 for(const line of $("sessionEditor").children)line.classList.toggle("es-just-added",!!id&&line.querySelector("[data-session-name]")?.dataset.sessionName===id);
}
function addSession(preset=null){if(!checkMaster("受付区分の追加"))return;
 const name=(typeof preset==="string"?preset:$("newSessionName").value).trim();
 if(!name){sessionLocalFeedback("受付区分名を入力してください。","warn");return;}
 const snap=settingsSnapshot();
 if(Object.values(snap.ns).some(v=>v.trim()===name)){sessionLocalFeedback("「"+name+"」は設定済みです。","warn");return;}
 let newId=null;
 if(mutate(e=>{if(e.sessions.some(s=>s.name===name))throw Error("同じ名前の受付区分があります");newId=sessionId();e.sessions.push({id:newId,name});for(const p of e.participants)p.planned[newId]=false;})){
  snap.add="";restoreSettingsSnapshot(snap);announce("");sessionLocalFeedback("「"+name+"」を追加しました。","success",newId);
 }
}
function removeSession(id){
 const e=current(),s=e.sessions.find(x=>x.id===id);if(!s)return;if(e.sessions.length===1)return announce("受付区分は最低1つ必要です。","warn");
 if(e.participants.some(p=>p.checkins?.[id]))return announce("受付履歴がある区分は削除できません。","warn");
 if(!confirm("受付区分「"+s.name+"」を削除しますか？"))return;const snap=settingsSnapshot();
 if(mutate(next=>{next.sessions=next.sessions.filter(x=>x.id!==id);for(const p of next.participants){delete p.planned[id];delete p.checkins[id];}})){delete snap.ns[id];restoreSettingsSnapshot(snap);}
}
/* 一覧だけをページング。名簿データ自体は全件保持し、CSV出力も従来どおり全件。 */
function setParticipantPage(page){
 participantPage=page;renderParticipants();$("ptTableViewport").scrollTop=0;
}
function participantPageButton(page,currentPage){
 const btn=document.createElement("button");btn.type="button";btn.className="btn small"+(page===currentPage?" active":"");
 btn.dataset.ptPage=String(page);btn.textContent=String(page);btn.setAttribute("aria-label",page+"ページへ");
 if(page===currentPage)btn.setAttribute("aria-current","page");
 return btn;
}
function renderParticipants(){
 const e=current();
 if(participantActiveEvent!==e.id){
  participantActiveEvent=e.id;participantPage=1;$("personQuery").value="";
  $("personSessionFilter").value="all";
 }
 if(participantImportEvent!==e.id){
  participantImportEvent=e.id;
  // 名簿のあるイベントでは一覧を優先。利用者が開閉したあとは状態を保持する。
  $("participantImportDetails").open=!e.participants.some(p=>!p.removed);
 }
 const all=e.participants.filter(p=>!p.removed),staff=all.filter(p=>validStaff(p.staffId)).length;
 $("ptTotalCount").innerHTML=all.length+'<small>名</small>';
 $("ptStaffCount").innerHTML=staff+'<small>名</small>';
 $("ptMissingCount").innerHTML=(all.length-staff)+'<small>名</small>';
 $("peopleCount").textContent=all.length+"名";
 const select=$("personSessionFilter"),oldFilter=select.value;
 select.replaceChildren();select.add(new Option("すべて","all"));
 for(const s of e.sessions)select.add(new Option(s.name,s.id));
 select.add(new Option("参加予定なし","none"));
 select.value=[...select.options].some(o=>o.value===oldFilter)?oldFilter:"all";
 const filter=select.value,q=$("personQuery").value.trim().toLowerCase();
 const people=all.filter(p=>[p.name,p.staffId,p.department,p.group,p.id,customSearchText(e,p)].join(" ").toLowerCase().includes(q)
  &&(filter==="all"||(filter==="none"?!e.sessions.some(s=>p.planned[s.id]):!!p.planned[filter])));
 const pages=Math.max(1,Math.ceil(people.length/participantPageSize));
 participantPage=Math.min(Math.max(1,participantPage),pages);
 const start=(participantPage-1)*participantPageSize,shown=people.slice(start,start+participantPageSize),tbody=$("participantRows");
 const customCols=customColumnIndices(e),header=document.querySelector("#ptTableViewport thead tr");
 for(const th of header.querySelectorAll("[data-pt-custom]"))th.remove();
 const before=header.children[header.children.length-2];
 for(const i of customCols){const th=document.createElement("th");th.scope="col";th.dataset.ptCustom=String(i);th.textContent=e.customLabels[i];header.insertBefore(th,before);}
 tbody.replaceChildren();
 for(const p of shown){
  const tr=document.createElement("tr"),sessions=e.sessions.filter(s=>p.planned[s.id]).map(s=>s.name).join(" / ");
  tr.innerHTML="<td>"+esc(p.id)+"</td><td>"+esc(p.name)+"</td><td>"+esc(p.staffId||"—")+"</td><td>"+esc(p.department||"—")+"</td><td>"+esc(p.group||"—")+"</td>"+
 customCols.map(i=>'<td class="pt-custom-cell" title="'+esc(customDisplayValue(e,p,i))+'">'+esc(customDisplayValue(e,p,i)||"—")+"</td>").join("")+
 '<td><span class="tag">'+esc(sessions||"対象外")+'</span></td><td><button class="btn small" data-action="edit-person" data-person="'+esc(p.id)+'">編集</button></td>';
  tbody.append(tr);
 }
 if(!people.length){const tr=document.createElement("tr");tr.innerHTML='<td colspan="'+(7+customCols.length)+'" class="pt-empty">該当する参加者がいません。</td>';tbody.append(tr);}
 $("ptPageInfo").textContent=people.length?(start+1)+"–"+Math.min(start+participantPageSize,people.length)+" / "+people.length+"名"+(people.length!==all.length?"（全"+all.length+"名）":""):"0 / 0名";
 $("ptPagePrev").disabled=participantPage<=1;
 $("ptPageNext").disabled=participantPage>=pages;
 const buttons=$("ptPageButtons");buttons.replaceChildren();
 const first=Math.max(1,Math.min(participantPage-2,pages-4)),last=Math.min(pages,first+4);
 if(first>1){buttons.append(participantPageButton(1,participantPage));if(first>2){const dots=document.createElement("span");dots.textContent="…";buttons.append(dots);}}
 for(let p=first;p<=last;p++)buttons.append(participantPageButton(p,participantPage));
 if(last<pages){if(last<pages-1){const dots=document.createElement("span");dots.textContent="…";buttons.append(dots);}buttons.append(participantPageButton(pages,participantPage));}
}


function savePersonFromForm(andCheck){if(!checkMaster("参加者の登録・編集"))return;const id=$("personId")?.value||"",name=$("personName").value.trim(),staffId=normStaff($("personStaff").value),department=$("personDept").value.trim(),group=$("personGroup").value.trim();if(staffId&&!validStaff(staffId))return announce("職員番号は半角英数字（ハイフンなし）で入力してください。","warn");if(!name)return announce("氏名は必須です。","warn");const e=current(),planned=Object.fromEntries(e.sessions.map(s=>[s.id,!!$("planned-"+s.id)?.checked]));let values;try{values=[0,1].map(i=>normalizeCustom(e,i,$("personCustom"+i)?.value||""));}catch(err){return announce(err.message,"warn");}if(andCheck)planned[curSession().id]=true;let checkResult=null;const ok=mutate(next=>{if(staffId&&next.participants.some(p=>p.id!==id&&!p.removed&&staffKey(p.staffId)===staffKey(staffId)))throw Error("同じ職員番号の人が登録されています");let p=id?next.participants.find(p=>p.id===id):null;if(id&&!p)throw Error("参加者が見つかりません");if(!p){p={id:String(next.nextParticipant++).padStart(4,"0"),name,staffId,department,group,customValues:values,planned,checkins:{},source:day?"walkin":"pre",removed:false};next.participants.push(p);}else{for(const s of next.sessions)if(!planned[s.id]&&checked(p,s.id))throw Error("受付済みの区分は参加対象外にできません。受付取消後に変更してください。");Object.assign(p,{name,staffId,department,group,customValues:values,planned});}
 if(andCheck){const s=curSession(),prior=p.checkins[s.id];if(prior?.active!==false&&prior){checkResult={duplicate:true,person:p,when:prior.lastAt||prior.at};}else{const at=iso();if(prior){prior.active=true;prior.lastAt=at;prior.method="manual";prior.syncOrigin=deviceId();(prior.history||(prior.history=[])).push({type:"recheck",at,method:"manual"});}else p.checkins[s.id]={at,lastAt:at,method:"manual",initialMethod:"manual",active:true,history:[],syncOrigin:deviceId()};checkResult={person:p,when:at};}}
 });if(!ok)return;closeDialog();if(andCheck){showResult(checkResult.person,checkResult.duplicate?"受付済み（重複）":"受付完了",checkResult.duplicate?"warn":"success",curSession()?.name,checkResult.when);announce("参加者情報を保存しました。","success");}else announce("参加者情報を保存しました。","success");}

function customFieldHTML(e,p,i){
 const label=esc(e.customLabels?.[i]||"追加項目"+(i+1)),value=p?.customValues?.[i]||"";
 const type=getCustomType(e,i),id="personCustom"+i;
 if(type==="text")return '<label class="field">'+label+'<input id="'+id+'" value="'+esc(value)+'"></label>';
 const choices=type==="bool"?["有","無"]:getCustomOptions(e,i);
 const values=["",...choices];
 if(value&&!values.includes(value))values.push(value);
 return '<label class="field">'+label+'<select id="'+id+'">'+values.map(v=>'<option value="'+esc(v)+'"'+(v===value?" selected":"")+'>'+esc(type==="bool"?(v==="有"?"はい":v==="無"?"いいえ":"未選択"):(v||"選択してください"))+'</option>').join("")+'</select></label>';
}
function openPerson(id=null,dayMode=day){if(!checkMaster("参加者の登録・編集"))return;
 const e=current(),p=id?e.participants.find(x=>x.id===id):null;
 const session=curSession(),div=document.createElement("div");
 const planned=s=>p?p.planned[s.id]===true:(dayMode?s.id===session?.id:e.sessions.length===1);
 div.innerHTML='<input type="hidden" id="personId" value="'+esc(p?.id||"")+'">'+
 '<div class="fields two">'+
 '<label class="field">氏名（必須）<input id="personName" value="'+esc(p?.name||"")+'"></label>'+
 '<label class="field">職員番号<input id="personStaff" value="'+esc(p?.staffId||"")+'"></label>'+
 '<label class="field">所属<input id="personDept" value="'+esc(p?.department||"")+'"></label>'+
 '<label class="field">グループ（任意）<input id="personGroup" value="'+esc(p?.group||"")+'"></label>'+
 customFieldHTML(e,p,0)+customFieldHTML(e,p,1)+'</div>'+
 '<h3 style="margin-top:16px">参加予定</h3><div class="checkboxes">'+
 e.sessions.map(s=>'<label class="check"><input type="checkbox" id="planned-'+esc(s.id)+'" '+(planned(s)?"checked":"")+">"+esc(s.name)+"</label>").join("")+
 '</div><div id="personHistory"></div><div class="form-actions">'+
 '<button class="btn main" id="savePersonDialog">保存</button>'+
 (dayMode?'<button class="btn soft" id="saveAndCheck">保存して受付</button>':"")+
 (p?'<button class="btn danger right" id="removePerson">参加者を除外</button>':"")+'</div>';
 openDialog(p?"参加者の編集":"参加者を追加",div);
 $("savePersonDialog").onclick=()=>savePersonFromForm(false);
 if(dayMode)$("saveAndCheck").onclick=()=>savePersonFromForm(true);
 if(p){
  $("removePerson").onclick=()=>{
   if(!confirm("参加者を除外しますか？過去の受付履歴は保持します。"))return;
   if(mutate(next=>{next.participants.find(x=>x.id===id).removed=true;})){
    closeDialog();announce("参加者を除外しました。","warn");
   }
  };
  renderPersonHistory(p);
 }
 $("personName").focus();
}
function renderPersonHistory(p){
 const e=current(),root=$("personHistory");root.replaceChildren();
 const heading=document.createElement("h3");heading.style.marginTop="18px";heading.textContent="受付履歴";root.append(heading);
 for(const s of e.sessions){
  const card=document.createElement("div");card.className="history-card";
  const top=document.createElement("div");top.className="row";
  const title=document.createElement("strong");title.textContent=s.name;
  const status=document.createElement("span");status.className="tag "+(!p.planned[s.id]?"off":checked(p,s.id)?"":"warn");
  status.textContent=checked(p,s.id)?"受付済み":p.planned[s.id]?"未受付":"対象外";
  top.append(title,status);card.append(top);
  const c=p.checkins?.[s.id];
  if(c){
   const log=document.createElement("div");log.className="history-events";
   const entries=[{label:"初回受付",at:c.at,method:c.initialMethod||c.method||"qr"}];
   for(const h of c.history||[])entries.push({label:h.type==="cancel"?"受付取消":h.type==="recheck"?"再受付":h.type,at:h.at,method:h.method||"",reason:h.reason||""});
   if(c.canceledAt&&!entries.some(x=>x.label==="受付取消"&&x.at===c.canceledAt))entries.push({label:"受付取消",at:c.canceledAt,method:""});
   for(const item of entries){
    const row=document.createElement("div");row.className="history-event";
    const left=document.createElement("span");left.textContent=item.label+(item.method?"・"+(item.method==="manual"?"手動":"QR"):"");
    const right=document.createElement("span");right.textContent=localDate(item.at);
    row.append(left,right);log.append(row);
    if(item.reason){const reason=document.createElement("div");reason.className="small-note";reason.textContent="理由："+item.reason;log.append(reason);}
   }
   card.append(log);
  }
  if(checked(p,s.id)){
   const btn=document.createElement("button");btn.type="button";btn.className="btn small danger";btn.textContent="受付取消";
   btn.style.marginTop="10px";
   btn.onclick=()=>cancelAttendance(p.id,s.id,true);
   card.append(btn);
  }
  root.append(card);
 }
}
/* 受付取消は参加者詳細画面と右側の受付済み一覧で共通化。履歴と初回時刻を維持する。 */
function cancelAttendance(personId,sessionId,closeOnSuccess=false){
 const e=current(),p=e?.participants.find(x=>x.id===personId),s=e?.sessions.find(x=>x.id===sessionId);
 if(!p||p.removed||!s||!checked(p,sessionId)){announce("この参加者の受付済み記録は見つかりません。","warn");return false;}
 if(!confirm(p.name+" さんの「"+s.name+"」の受付を取り消しますか？"))return false;
 const reason=prompt("取消理由を入力してください（例：誤受付）","誤受付");
 if(reason===null)return false;
 const ok=mutate(next=>{
  const part=next.participants.find(x=>x.id===personId),hist=part?.checkins?.[sessionId];
  if(!part||part.removed||!hist||hist.active===false)throw Error("受付済み記録がないため取り消せません。");
  hist.active=false;hist.canceledAt=iso();hist.syncOrigin=deviceId();
  (hist.history||(hist.history=[])).push({type:"cancel",at:hist.canceledAt,reason:reason.trim().slice(0,200)});
 });
 if(ok){if(closeOnSuccess)closeDialog();announce(p.name+" さんの受付取消を記録しました。","warn");}
 return ok;
}
/* 手動受付: 検索を保ったまま見出しで昇順／降順に並び替え。 */
const MANUAL_SORT_COLUMNS=[["id","ID"],["name","氏名"],["staffId","職員番号"],["department","所属"]];
function manualColumns(e){return [...MANUAL_SORT_COLUMNS,...customColumnIndices(e).map(i=>["custom"+i,e.customLabels[i]])];}
function manualSortValue(e,p,field){return /^custom[01]$/.test(field)?customDisplayValue(e,p,Number(field.slice(-1))):p[field];}
let manualSortField="id",manualSortDirection=1;
function openManual(){
 manualSortField="id";manualSortDirection=1;
 const panel=document.createElement("div");
 const headings=manualColumns(current()).map(([field,label])=>'<th scope="col" data-manual-sort-column="'+field+'" aria-sort="none"><button type="button" class="manual-sort" data-manual-sort="'+field+'">'+esc(label)+' <span class="manual-sort-arrow" aria-hidden="true">↕</span></button></th>').join("");
 panel.innerHTML='<input id="manualQuery" class="search" aria-label="参加者を検索" placeholder="氏名・職員番号・所属・追加項目・参加者IDを検索" autofocus>'+
  '<div class="tablewrap manual-tablewrap"><table class="manual-table" aria-label="名前から受付の参加者一覧"><thead><tr>'+headings+
  '<th scope="col">状況</th><th scope="col">受付</th></tr></thead><tbody id="manualRows"></tbody></table></div>';
 openDialog("名前から受付・変更",panel);
 $("manualQuery").addEventListener("input",renderManual);
 renderManual();
 $("manualQuery").focus();
}
function changeManualSort(field){
 if(!manualColumns(current()).some(([key])=>key===field))return;
 if(manualSortField===field)manualSortDirection*=-1;
 else{manualSortField=field;manualSortDirection=1;}
 renderManual();
}
function renderManual(){
 const q=$("manualQuery").value.toLowerCase().trim(),e=current(),s=curSession(),tbody=$("manualRows");
 const people=e.participants.filter(p=>!p.removed&&[p.name,p.staffId,p.department,p.group,p.id,customSearchText(e,p)].join(" ").toLowerCase().includes(q))
  .sort((a,b)=>{
   const av=String(manualSortValue(e,a,manualSortField)??""),bv=String(manualSortValue(e,b,manualSortField)??"");
   return av.localeCompare(bv,"ja",{numeric:true,sensitivity:"base"})*manualSortDirection||a.id.localeCompare(b.id,"ja",{numeric:true});
  }).slice(0,100);
 tbody.replaceChildren();
 for(const p of people){
  const tr=document.createElement("tr");
  for(const v of [p.id,p.name,p.staffId||"—",p.department||"—",...customColumnIndices(e).map(i=>customDisplayValue(e,p,i)||"—"),checked(p,s.id)?"受付済み":p.planned[s.id]?"未受付":"対象外"]){
   const td=document.createElement("td");td.textContent=v;tr.append(td);
  }
  const td=document.createElement("td"),button=document.createElement("button");
  button.type="button";button.className="btn small";button.dataset.manualPerson=p.id;button.textContent="選択";
  td.append(button);tr.append(td);tbody.append(tr);
 }
 for(const th of document.querySelectorAll(".manual-table th[data-manual-sort-column]")){
  const selected=th.dataset.manualSortColumn===manualSortField;
  th.setAttribute("aria-sort",selected?(manualSortDirection===1?"ascending":"descending"):"none");
  th.querySelector(".manual-sort-arrow").textContent=selected?(manualSortDirection===1?"▲":"▼"):"↕";
 }
}
function manualCheck(id){const e=current(),p=e.participants.find(x=>x.id===id),s=curSession();if(!p)return;if(checked(p,s.id)){if(!isMaster())return announce("受付済みの記録は右側の「受付済み」一覧から取消してください。","warn");return openPerson(id,true);}if(!p.planned[s.id]&&!isMaster())return announce("受付対象外です。参加予定の変更はマスターPCで行ってください。","warn");if(!p.planned[s.id]&&!confirm(p.name+" さんを「"+s.name+"」の参加対象にして受付しますか？"))return;const res=checkIn(id,"manual",true);if(res){closeDialog();}}
function checkInByToken(code){
 const staffId=normStaff(code);
 if(!validStaff(staffId)){showResult(null,"職員番号以外のQRです","error");return;}
 const matched=current().participants.filter(p=>!p.removed&&p.staffId&&staffKey(p.staffId)===staffKey(staffId));
 if(matched.length!==1){showResult(null,matched.length?"職員番号が重複しています":"名簿にない職員番号です","error");return;}
 checkIn(matched[0].id,"qr",false);
}
function checkIn(id,method,allowPlan){if(allowPlan&&!isMaster())return announce("参加予定の変更はマスターPCで行ってください。","warn"),false;const e=current(),s=curSession();let result=null;const person=e.participants.find(p=>p.id===id);if(!person||person.removed){showResult(person,"受付できません","error");return false;}if(checked(person,s.id)){const c=person.checkins[s.id];showResult(person,"受付済み（重複）","warn",s.name,c.lastAt||c.at);return false;}if(!person.planned[s.id]&&!allowPlan){showResult(person,"この区分は参加対象外です","warn",s.name);const action=document.createElement("button");action.type="button";action.className="btn soft";action.style.marginTop="12px";action.textContent="この区分を参加対象に変更して受付";action.onclick=()=>{if(!confirm(person.name+" さんを「"+s.name+"」の参加対象に変更して受付しますか？"))return;checkIn(id,method,true);};$("checkinResult").append(action);return false;}
const ok=mutate(next=>{const p=next.participants.find(p=>p.id===id),at=iso();if(allowPlan)p.planned[s.id]=true;const c=p.checkins[s.id];if(c){c.active=true;c.lastAt=at;c.method=method;c.syncOrigin=deviceId();(c.history||(c.history=[])).push({type:"recheck",at,method});}else p.checkins[s.id]={at,lastAt:at,method,initialMethod:method,active:true,history:[],syncOrigin:deviceId()};result={person:p,at};});if(!ok){showResult(person,"保存に失敗しました","error");return false;}showResult(result.person,"受付完了","success",s.name,result.at);return true;}
function showResult(person,txt,level="warn",session="",at=""){
 const d=$("checkinResult");d.className="result "+level;
 if(level){void d.offsetWidth;d.classList.add("flash");}
 d.replaceChildren();
 const head=document.createElement("div");head.className="outcome";
 head.textContent=({success:"✓ ",warn:"！ ",error:"✕ "}[level]||"")+txt;
 feedback(level);d.append(head);
 if(!person)return;
 const name=document.createElement("div");name.className="person-name";name.textContent=person.name;d.append(name);
 // Make group identification prominent for the person standing in front of the camera.
 if(person.group){
  const group=document.createElement("div");group.className="person-group";
  const label=document.createElement("span");label.className="person-group-label";label.textContent="グループ";
  const value=document.createElement("strong");value.className="person-group-value";value.textContent=person.group;
  group.append(label,value);d.append(group);
 }
 const meta=document.createElement("div");meta.className="person-meta";
 meta.textContent=[person.department,session,at?localDate(at):""].filter(Boolean).join("　/　");
 if(meta.textContent)d.append(meta);
 const custom=document.createElement("div");custom.className="rx-result-custom";
 if(appendCustomDetails(custom,current(),person,"rx-custom-pill"))d.append(custom);
}
function showReceptionTab(tab){
 receptionTab=tab==="checked"?"checked":"pending";
 $("pendingRows").hidden=receptionTab!=="pending";
 $("checkedRows").hidden=receptionTab!=="checked";
 for(const type of ["pending","checked"]){
  const button=$(type==="pending"?"tabPending":"tabChecked");
  const active=receptionTab===type;
  button.classList.toggle("active",active);
  button.setAttribute("aria-selected",String(active));
  
 }
}
/* 右側の一覧から受付操作。表示時の受付区分も保持し、切替後の誤操作を防ぐ。 */
function receptionRowActions(p,s,alreadyChecked){
 const actions=document.createElement("div");actions.className="rx-person-actions";
 const id=document.createElement("span");id.className="code";id.textContent="#"+p.id;
 const button=document.createElement("button");
 button.type="button";button.className="btn small rx-person-action"+(alreadyChecked?" rx-person-cancel":"");
 button.textContent=alreadyChecked?"受付取消":"手動受付";
 button.dataset[alreadyChecked?"receptionCancel":"receptionCheckin"]=p.id;
 button.dataset.sessionId=s.id;
 button.setAttribute("aria-label",p.name+" さんの"+button.textContent+"（"+s.name+"）");
 actions.append(id,button);return actions;
}
function quickReceptionCheckIn(id,sessionId){
 const s=curSession(),p=current()?.participants.find(x=>x.id===id);
 if(!s||s.id!==sessionId){announce("受付区分が変更されました。表示を確認してください。","warn");return;}
 if(!p||p.removed||!p.planned[sessionId]){announce("この区分の未受付者ではありません。","warn");return;}
 checkIn(id,"manual",false);
}
function quickReceptionCancel(id,sessionId){
 if(curSession()?.id!==sessionId){announce("受付区分が変更されました。表示を確認してください。","warn");return;}
 cancelAttendance(id,sessionId);
}
/* Explicit, scoped reset for test check-ins. Deletes attendance records and audit history, not participants. */
function openClearAttendanceDialog(){if(!checkMaster("受付記録の一括クリア"))return;
 const e=current(),session=curSession();
 if(!day||!e||!session)return;
 resetCameraPaused=true;
 if(CAM.running&&!CAM.busy)stopCamera();
 const originId=e.id,originSessionId=session.id;
 const panel=document.createElement("div");panel.className="rx-clear-dialog";
 panel.innerHTML=
  '<p class="rx-clear-warning">選んだ範囲の受付時刻・受付済み状態・取消／再受付履歴を完全に削除します。元には戻せません。</p>'+
  '<p class="hint">イベント名・参加者名簿・職員番号・参加予定の設定は残ります。テストで追加した飛び入り参加者も削除されません。誤って再受付しないようカメラは停止します。次のテスト時に手動で起動してください。</p>'+
  '<fieldset class="rx-clear-scope"><legend>クリアする範囲</legend>'+
  '<label class="check"><input type="radio" name="clearAttendanceScope" value="session" checked> 現在の受付区分だけ</label>'+
  '<label class="check"><input type="radio" name="clearAttendanceScope" value="all"> このイベントの全受付区分</label>'+
  '</fieldset>'+
  '<p class="rx-clear-count" id="clearAttendanceCount"></p>'+
  '<label class="field">確認のため「クリア」と入力してください<input type="text" id="clearAttendancePhrase" autocomplete="off" placeholder="クリア"></label>'+
  '<div class="delete-dialog-buttons"><button type="button" class="btn" id="clearAttendanceBackup">⇩ 先にJSONを保存</button><button type="button" class="btn" id="clearAttendanceCancel">キャンセル</button><button type="button" class="btn danger" id="clearAttendanceCommit" disabled>受付記録を削除する</button></div>';
 openDialog("受付状況を一括クリア",panel);
 const phrase=$("clearAttendancePhrase"),commit=$("clearAttendanceCommit");
 const scope=()=>panel.querySelector('input[name="clearAttendanceScope"]:checked')?.value==="all"?"all":"session";
 const update=()=>{
  const all=scope()==="all";
  const records=e.participants.reduce((sum,p)=>sum+(all?Object.keys(p.checkins||{}).length:Number(!!p.checkins?.[originSessionId])),0);
  const active=e.participants.reduce((sum,p)=>sum+(all?e.sessions.filter(s=>checked(p,s.id)).length:Number(checked(p,originSessionId))),0);
  $("clearAttendanceCount").textContent="対象："+(all?"全受付区分":session.name)+" ／ 受付記録 "+records+"件（うち受付済み "+active+"件）";
  commit.disabled=phrase.value.trim()!=="クリア"||records===0;
 };
 phrase.addEventListener("input",update);
 for(const radio of panel.querySelectorAll('input[name="clearAttendanceScope"]'))radio.addEventListener("change",update);
 $("clearAttendanceCancel").onclick=closeDialog;
 $("clearAttendanceBackup").onclick=backup;
 commit.onclick=()=>{
  if(phrase.value.trim()!=="クリア"||commit.disabled)return;
  if(activeId!==originId||!day)return announce("対象イベントが変更されたため、もう一度操作してください。","warn");
  const all=scope()==="all";
  const done=mutate(next=>{
   for(const p of next.participants){if(all)p.checkins={};else if(p.checkins)delete p.checkins[originSessionId];}
   // A cleared generation cannot accept an old attendance snapshot.
   next.attendanceEpoch="A-"+randomHex(8);next.attendanceImports={};
  });
  if(!done)return;
  lastScan="";lastScanAt=0;
  closeDialog();showResult(null,"QRコードをかざしてください","");
  announce("受付記録をクリアしました（"+(all?"全受付区分":session.name)+"）。他PCの古い実績ファイルは取り込めません。受付PCへ最新の全イベントJSONを再配布してください。","warn");
 };
 update();
 phrase.focus();
}
function renderReception(){
 const e=current(),sel=$("checkinSession"),existing=sel.value;
 sel.replaceChildren();
 for(const s of e.sessions)sel.add(new Option(s.name,s.id));
 sel.value=e.sessions.some(s=>s.id===existing)?existing:e.sessions[0].id;
 const s=curSession();
 const people=e.participants.filter(p=>!p.removed&&p.planned[s.id]);
 // A changed attendance plan must not hide an existing valid check-in.
 const attended=e.participants.filter(p=>!p.removed&&checked(p,s.id)).sort((a,b)=>{
  const time=p=>p.checkins[s.id].lastAt||p.checkins[s.id].at||"";
  return time(b).localeCompare(time(a))||a.name.localeCompare(b.name,"ja");
 });
 // 受付取消した当日登録者も「未受付」に戻し、右側から再受付できるようにする。
 const pending=people.filter(p=>!checked(p,s.id)&&(p.source!=="walkin"||p.checkins?.[s.id]?.active===false)).sort((a,b)=>a.name.localeCompare(b.name,"ja"));
 const walkins=attended.filter(p=>p.source==="walkin").length,base=Math.max(people.length,attended.length);
 $("daySummary").innerHTML=summaryMetric("参加対象",people.length)+summaryMetric("未受付",pending.length)+summaryMetric("当日登録",walkins);
 $("rxProgressText").textContent=attended.length+" / "+people.length;
 $("rxProgressBar").style.width=(base?Math.round(attended.length/base*100):0)+"%";
 $("pendingSessionName").textContent=s.name;
 $("pendingCount").textContent=String(pending.length);
 $("checkedCount").textContent=String(attended.length);
 const waiting=$("pendingRows"),arrived=$("checkedRows");
 waiting.replaceChildren();arrived.replaceChildren();
 waiting.classList.toggle("empty",!pending.length);arrived.classList.toggle("empty",!attended.length);
 if(!pending.length)waiting.textContent="✓　事前登録者の未受付なし";
 for(const p of pending){
  const row=document.createElement("div");row.className="pending-person";
  const text=document.createElement("div"),title=document.createElement("b"),sub=document.createElement("small");
  text.className="rx-person-info";
  title.textContent=p.name;sub.textContent=[p.department,p.group].filter(Boolean).join(" ／ ")||"所属未登録";text.append(title,sub);appendCustomDetails(text,e,p,"rx-custom-line");
  row.append(text,receptionRowActions(p,s,false));waiting.append(row);
 }
 if(!attended.length)arrived.textContent="まだ受付済みの参加者はいません。";
 for(const p of attended){
  const row=document.createElement("div");row.className="pending-person";
  const text=document.createElement("div"),title=document.createElement("b"),sub=document.createElement("small"),detail=document.createElement("div");
  text.className="rx-person-info";
  title.textContent=p.name;sub.textContent=[p.department,p.group].filter(Boolean).join(" ／ ")||"所属未登録";
  detail.className="attendance-detail";
  const method=document.createElement("span");method.className="attendance-method"+(p.source==="walkin"?" walkin":"");
  const record=p.checkins[s.id];
  method.textContent=p.source==="walkin"?"当日登録":record.method==="manual"?"手動受付":"QR受付";
  const clock=document.createElement("span");clock.className="checkin-time";
  clock.textContent=localDate(record.lastAt||record.at);
  detail.append(method,clock);text.append(title,sub);appendCustomDetails(text,e,p,"rx-custom-line");text.append(detail);
  row.append(text,receptionRowActions(p,s,true));arrived.append(row);
 }
 showReceptionTab(receptionTab);
 renderDayCheck();
 if(!CAM.running&&!CAM.busy&&meta.cameraId&&!resetCameraPaused)startCamera();
}
/* Camera scanning with Html5Qrcode directly (own Japanese UI).
   The library decodes the qrbox at its on-screen CSS size, so the reader is laid out at the camera's native width
   and only visually scaled down. That keeps the decode canvas at full camera resolution (HD when available),
   which lets fixed-focus laptop cameras read cards held 30-40cm away instead of only very close and blurry. */
const CAM={qr:null,running:false,busy:false,width:1280,frames:0,native:null,timer:null};
let resetCameraPaused=false;
// Only use the browser's built-in detector when it really lists qr_code; otherwise the JS decoder (ZXing) is used.
async function nativeQrSupported(){if(CAM.native!==null)return CAM.native;try{CAM.native=!!(window.BarcodeDetector&&(await BarcodeDetector.getSupportedFormats()).includes("qr_code"));}catch{CAM.native=false;}return CAM.native;}
function camRate(){clearInterval(CAM.timer);CAM.frames=0;let last=Date.now();CAM.timer=setInterval(()=>{if(!CAM.running){clearInterval(CAM.timer);return;}const now=Date.now(),rate=Math.round(CAM.frames*1000/(now-last));CAM.frames=0;last=now;const el=$("camStats");if(el)el.textContent="解析 "+rate+"回/秒・"+(CAM.native?"内蔵検出":"JS解析");},1000);}
function saveCameraFrame(){const v=document.querySelector("#reader video");if(!v||!v.videoWidth)return announce("カメラが起動していません。","warn");const c=document.createElement("canvas");c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0);downloadLink(c.toDataURL("image/png"),"camera_frame_"+stamp()+".png");announce("カメラ映像の1コマを保存しました（調査用）。人物が写っている場合は取り扱いに注意してください。","success");}
function camHint(t,level=""){const h=$("cameraHint");h.textContent=t;h.className="hint"+(level?" cam-"+level:"");}
function camUI(){$("cameraStart").hidden=CAM.running;$("cameraStop").hidden=!CAM.running;$("camDiag").hidden=!CAM.running;$("cameraStart").disabled=CAM.busy;$("cameraSelect").disabled=CAM.busy;$("receptionView").classList.toggle("cam-on",CAM.running);$("receptionView").classList.toggle("cam-busy",CAM.busy);}
function fitReader(){const vp=$("readerViewport"),r=$("reader");if(!CAM.running){r.style.transform="";vp.style.height="";return;}const k=Math.min(1,vp.clientWidth/CAM.width),off=Math.max(0,(vp.clientWidth-CAM.width*k)/2);r.style.transform="translateX("+off+"px) scale("+k+")";vp.style.height=Math.ceil(r.offsetHeight*k)+"px";}
function camError(err){const n=err?.name||"",m=String(err?.message||err||"");
 if(!window.isSecureContext&&!navigator.mediaDevices)return "このページではカメラを使用できません（HTTPS等が必要な環境です）。紙名簿や「名前から受付」を利用してください。";
 if(n==="NotAllowedError"||/Permission|NotAllowed/i.test(m))return "カメラの使用が許可されていません。アドレスバーのカメラのアイコンから「許可」にして、もう一度「カメラを起動」を押してください。";
 if(n==="NotFoundError"||/NotFound|no camera|Requested device not found/i.test(m))return "カメラが見つかりません。USBカメラの接続や、PCのカメラ設定を確認してください。";
 if(n==="OverconstrainedError"||/Overconstrained/i.test(m))return "このカメラは要求した撮影条件に対応していません。カメラが複数ある場合は選択欄で別のカメラを選び、もう一度「カメラを起動」を押してください。（"+m+"）";
 if(n==="NotReadableError"||/NotReadable|Could not start video source/i.test(m))return "カメラを開始できません。Teams・Zoomなど他のアプリがカメラを使っていないか確認してください。";
 return "カメラを開始できません："+m;}
async function loadCameras(){const cams=await Html5Qrcode.getCameras(),sel=$("cameraSelect");sel.replaceChildren();cams.forEach((c,i)=>sel.add(new Option(c.label||"カメラ "+(i+1),c.id)));if(!cams.length)throw {name:"NotFoundError"};if(cams.some(c=>c.id===meta.cameraId))sel.value=meta.cameraId;sel.hidden=cams.length<2;}
function onScan(text){if(!$("dialogBackdrop").hidden||resetCameraPaused)return;const code=String(text).trim(),now=Date.now();if(code===lastScan&&now-lastScanAt<3000){lastScanAt=now;return;}lastScan=code;lastScanAt=now;if(!day||view!=="event")return;checkInByToken(code);}
async function startCamera(){
 if(CAM.busy||CAM.running)return;
 resetCameraPaused=false;
 if(typeof Html5Qrcode!=="function")return camHint("QR読み取りライブラリが見つかりません。vendor/ を確認してください。","error");
 CAM.busy=true;camUI();camHint("カメラを起動中…（初回は許可を求める表示が出ます）");
 try{
  if(!$("cameraSelect").options.length)await loadCameras();
  const id=$("cameraSelect").value;
  const native=await nativeQrSupported();
  CAM.qr||=new Html5Qrcode("reader",{verbose:false,useBarCodeDetectorIfSupported:native,...(typeof Html5QrcodeSupportedFormats!=="undefined"?{formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE]}:{})});
  // Some PC cameras/drivers reject a constraint set (OverconstrainedError), e.g. a stale device id or
  // resolution handling. Try from best to most permissive; HD is only a preference (ideal), never required.
  const hd={width:{ideal:1280},height:{ideal:720}},attempts=[
   id&&{camera:{deviceId:{exact:id}},video:{deviceId:{exact:id},...hd}},
   id&&{camera:{deviceId:{exact:id}},video:{deviceId:{exact:id}}},
   {camera:{facingMode:"user"},video:{...hd}},
   {camera:{facingMode:"user"},video:null}].filter(Boolean);
  let lastErr=null,used=-1;
  for(let i=0;i<attempts.length;i++){
   const a=attempts[i];$("reader").style.width=CAM.width+"px";
   try{await CAM.qr.start(a.camera,{fps:12,qrbox:(w,h)=>{const side=Math.max(160,Math.floor(Math.min(w,h)*0.6));return {width:side,height:side};},...(a.video?{videoConstraints:a.video}:{})},t=>{CAM.frames++;onScan(t);},()=>{CAM.frames++;});used=i;break;}
   catch(err){lastErr=err;if(/NotAllowed|Permission/i.test(String(err?.name||err?.message||err)))break;try{if(CAM.qr.isScanning)await CAM.qr.stop();}catch{}await new Promise(r=>setTimeout(r,250));}
  }
  if(used<0)throw lastErr;
  CAM.running=true;camRate();
  const st=CAM.qr.getRunningTrackSettings?.()||{};
  meta.cameraId=st.deviceId||id||"";saveMeta();
  if(st.deviceId&&[...$("cameraSelect").options].some(o=>o.value===st.deviceId))$("cameraSelect").value=st.deviceId;
  camHint("読み取り中　QRを20〜40cm離してかざす"+((st.width||0)&&st.width<1000?"（低解像度カメラのため少し近づける）":"")+(used>0?" （標準設定で起動できなかったため、互換モードで起動しました）":""),"ok");
 }catch(err){CAM.running=false;camHint(camError(err),"error");try{if(CAM.qr?.isScanning)await CAM.qr.stop();}catch{}}
 finally{CAM.busy=false;camUI();setTimeout(fitReader,50);}
}
async function stopCamera(){if(!CAM.running||CAM.busy)return;CAM.busy=true;try{await CAM.qr.stop();}catch{}CAM.running=false;CAM.busy=false;camUI();fitReader();camHint("カメラ停止中");}
function eligibleQrPeople(e){return e.participants.filter(p=>!p.removed&&validStaff(p.staffId));}
let qrMode="single";
function switchQrMode(mode){
 qrMode=mode==="bulk"?"bulk":"single";
 $("qrIndividualArea").hidden=qrMode!=="single";
 $("qrBulkArea").hidden=qrMode!=="bulk";
 $("qrBulkHeading").textContent="まとめて発行する";
 for(const key of ["single","bulk"]){
  const b=$(key==="single"?"qrTabSingle":"qrTabBulk"),active=key===qrMode;
  b.classList.toggle("active",active);b.setAttribute("aria-selected",String(active));
 }
}
function renderQRSelect(){
 const e=current(),sel=$("qrPerson"),old=sel.value,people=eligibleQrPeople(e),other=e.participants.filter(p=>!p.removed).length-people.length;
 $("qrEligibleCount").textContent=people.length;
 $("qrExcludedCount").textContent=other;
 $("qrEligibility").setAttribute("aria-label","QR発行対象"+people.length+"名、職員番号なし"+other+"名");
 sel.replaceChildren();
 for(const p of people)sel.add(new Option(p.staffId+" / "+p.name,p.id));
 if([...sel.options].some(x=>x.value===old))sel.value=old;
 switchQrMode(qrMode);
 if(!people.length){
  qrRendered="";$("qrCanvas").replaceChildren();$("qrPersonName").textContent="発行対象者がいません";
  $("qrPersonStaff").textContent="";$("qrPersonGroup").textContent="";$("qrPersonGroup").hidden=true;$("qrPersonCustom").replaceChildren();$("qrPersonCustom").hidden=true;
  $("qrPosition").textContent="0 / 0";
  for(const id of ["qrPrevious","qrNext","downloadQR","printSingleQR","printQRs","exportQRZip"])$(id).disabled=true;
  return;
 }
 for(const id of ["downloadQR","printSingleQR","printQRs","exportQRZip"])$(id).disabled=false;
 renderOneQR();
}
function changeQRPerson(direction){
 const sel=$("qrPerson"),next=sel.selectedIndex+direction;
 if(next<0||next>=sel.options.length)return;
 sel.selectedIndex=next;renderOneQR();
}
function renderOneQR(){
 const people=eligibleQrPeople(current()),sel=$("qrPerson");
 const index=sel.selectedIndex,p=people.find(p=>p.id===sel.value);
 $("qrPrevious").disabled=index<=0;
 $("qrNext").disabled=index<0||index>=sel.options.length-1;
 $("qrPosition").textContent=(p?index+1:0)+" / "+people.length;
 if(!p){qrRendered="";return;}
 qrRendered=p.id;const root=$("qrCanvas");root.replaceChildren();
 $("qrPersonName").textContent=p.name;
 $("qrPersonStaff").textContent=p.staffId;
 $("qrPersonGroup").textContent=p.group||"";
 $("qrPersonGroup").hidden=!p.group;
 $("qrPersonCustom").replaceChildren();$("qrPersonCustom").hidden=!appendCustomDetails($("qrPersonCustom"),current(),p,"qr-custom-line");
 if(typeof QRCode!=="function")return announce("QRコード生成ライブラリがありません。","error");
 try{
  const tmp=document.createElement("div");
  new QRCode(tmp,{text:p.staffId,width:360,height:360,correctLevel:QRCode.CorrectLevel.M});
  const data=qrDataURL(tmp);if(!data)throw Error("画像を作成できません");
  const img=document.createElement("img");img.src=data;img.alt="職員番号"+p.staffId+"のQRコード";root.replaceChildren(img);
 }catch(err){announce("QR生成に失敗しました："+err.message,"error");}
}
function qrDataURL(root){
 const canvas=root.querySelector("canvas"),img=root.querySelector("img");
 if(canvas&&canvas.width&&canvas.height){
  // Add a quiet zone to the exported pixels, not merely to the on-screen element.
  const border=Math.ceil(Math.max(canvas.width,canvas.height)*0.20);
  const out=document.createElement("canvas");
  out.width=canvas.width+2*border;out.height=canvas.height+2*border;
  const ctx=out.getContext("2d");
  if(ctx){
   ctx.fillStyle="#FFFFFF";ctx.fillRect(0,0,out.width,out.height);
   ctx.imageSmoothingEnabled=false;ctx.drawImage(canvas,border,border);
   return out.toDataURL("image/png");
  }
 }
 if(canvas)return canvas.toDataURL("image/png");
 if(img?.src.startsWith("data:"))return img.src;
 return null;
}
/* Printed cards measure 91×55mm. Keep the individual/ZIP PNG at the same aspect ratio,
   with the same 36mm QR area and its embedded quiet zone. */
async function qrCardDataURL(p,qrImageData,e=current()){
 const image=new Image();
 await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error("QR画像を読み込めません"));image.src=qrImageData;});
 const scale=10,canvas=document.createElement("canvas");canvas.width=91*scale;canvas.height=55*scale;
 const ctx=canvas.getContext("2d");if(!ctx)throw Error("画像の描画に失敗しました");
 ctx.fillStyle="#FFFFFF";ctx.fillRect(0,0,canvas.width,canvas.height);
 // Match the card preview's teal accent, subtle separator and group label.
 ctx.fillStyle="#078b88";ctx.fillRect(0,0,canvas.width,3*scale);
 ctx.imageSmoothingEnabled=false;ctx.drawImage(image,6*scale,9.5*scale,36*scale,36*scale);
 ctx.imageSmoothingEnabled=true;
 ctx.fillStyle="#e0e8ec";ctx.fillRect(45.2*scale,9*scale,1,37*scale);
 const x=48*scale,maxWidth=39*scale,font='"Yu Gothic","Meiryo",sans-serif';
 ctx.fillStyle="#183a4f";ctx.font='bold 45px '+font;
 ctx.fillText(p.name,x,20.5*scale,maxWidth);
 ctx.fillStyle="#354b5e";ctx.font='38px '+font;
 ctx.fillText(p.staffId,x,29.5*scale,maxWidth);
 if(p.group){
  ctx.fillStyle="#f0f5f6";ctx.fillRect(47*scale,32.5*scale,40*scale,7.5*scale);
  ctx.fillStyle="#3e5667";ctx.font='31px '+font;
  ctx.fillText(p.group,x,38*scale,maxWidth);
 }
 ctx.fillStyle="#355468";ctx.font='24px '+font;
 for(const [i,entry] of customEntries(e,p).entries()){
  const full=entry.label+"："+entry.value;
  let shown=full;
  if(ctx.measureText(shown).width>maxWidth){
   while(shown&&ctx.measureText(shown+"…").width>maxWidth)shown=shown.slice(0,-1);
   shown=shown?shown+"…":"…";
  }
  ctx.fillText(shown,x,(p.group?44.7:36.9)*scale+i*5.2*scale,maxWidth);
 }
 return canvas.toDataURL("image/png");
}
async function downloadOneQR(){
 const p=eligibleQrPeople(current()).find(p=>p.id===$("qrPerson").value),img=$("qrCanvas").querySelector("img"),e=current();
 if(!p||!img?.src||p.id!==qrRendered)return announce("QR画像が準備できていません。","warn");
 const btn=$("downloadQR");btn.disabled=true;
 try{
  const data=await qrCardDataURL(p,img.src,e);
  downloadLink(data,"QR_card_"+fileSafe(p.staffId)+".png");markStep(e.id,"qr");
 }catch(err){announce("PNG保存に失敗しました："+err.message,"error");}
 finally{btn.disabled=false;}
}
async function printQRCards(people){
 if(typeof QRCode!=="function")return announce("QRライブラリがありません。","error");
 const root=$("printSheets");root.replaceChildren();const qrImages=[];let page=null,count=0,e=current();
 try{
  for(const p of people){
   if(count%10===0){page=document.createElement("div");page.className="print-page";root.append(page);}
   const card=document.createElement("div");card.className="print-card";
   const qr=document.createElement("div");new QRCode(qr,{text:p.staffId,width:360,height:360,correctLevel:QRCode.CorrectLevel.M});
   const data=qrDataURL(qr);if(!data)throw Error("QR画像の生成に失敗しました");
   const holder=document.createElement("div");holder.className="print-qr-holder";
   const img=document.createElement("img");img.src=data;img.alt="職員番号QR";holder.append(img);qrImages.push(img);
   const meta=document.createElement("div");meta.className="print-meta";
   const title=document.createElement("div");title.className="print-name";title.textContent=p.name;
   const staff=document.createElement("div");staff.className="print-staff";staff.textContent=p.staffId;
   meta.append(title,staff);
   if(p.group){const g=document.createElement("div");g.className="print-group";g.textContent=p.group;meta.append(g);}appendCustomDetails(meta,e,p,"print-custom");
   card.append(holder,meta);page.append(card);count++;
  }
 }catch(err){return announce("QR印刷の準備に失敗しました："+err.message,"error");}
 if(!count)return announce("職員番号のあるQR発行対象者がいません。","warn");
 await Promise.all(qrImages.map(img=>typeof img.decode==="function"?img.decode().catch(()=>{}):Promise.resolve()));
 document.body.dataset.printMode="qr";markStep(e.id,"qr");window.print();
}
async function printQR(){return printQRCards(eligibleQrPeople(current()));}
async function printSingleQR(){
 const p=eligibleQrPeople(current()).find(p=>p.id===$("qrPerson").value);
 if(!p)return announce("発行対象者を選択してください。","warn");
 return printQRCards([p]);
}
const ROSTER_ROWS_PER_PAGE=20;
const ROSTER_BLANK_ROWS=4;
function printReceptionRoster(sessionID){
 const e=current(),session=e?.sessions.find(s=>s.id===sessionID);
 if(!e||!session)return announce("印刷する受付区分を選択してください。","warn");
 // The paper list is independent of filtering/search and of the current digital check-in tab.
 const participants=e.participants.filter(p=>!p.removed&&p.planned?.[session.id])
  .sort((a,b)=>a.name.localeCompare(b.name,"ja")||String(a.staffId||"").localeCompare(String(b.staffId||""),"ja",{numeric:true})||a.id.localeCompare(b.id,"ja",{numeric:true}));
 const rows=[...participants.map(p=>({person:p})),...Array.from({length:ROSTER_BLANK_ROWS},(_,i)=>({extra:i+1}))];
 const rowsPerPage=participants.some(p=>customEntries(e,p).length)?16:ROSTER_ROWS_PER_PAGE;
 const pageCount=Math.ceil(rows.length/rowsPerPage),root=$("receptionPrint");
 root.replaceChildren();
 const printTime=localDate(iso());
 for(let pageNo=0;pageNo<pageCount;pageNo++){
  const page=document.createElement("section");page.className="roster-print-page";
  const heading=document.createElement("div");heading.className="roster-print-heading";
  const title=document.createElement("h1");title.textContent="受付名簿（紙チェック用）";
  const eventName=document.createElement("div");eventName.className="roster-print-event";eventName.textContent=e.name;
  const details=document.createElement("div");details.className="roster-print-details";
  details.textContent="開催日："+(e.date||"未設定")+"　｜　受付区分："+session.name+"　｜　参加予定："+participants.length+"名";
  const data=document.createElement("div");data.className="roster-print-meta";
  const printedChecked=participants.filter(p=>checked(p,session.id)).length;
  data.textContent="印刷時点の受付済み："+printedChecked+"名　｜　印刷日時："+printTime+"　｜　"+(pageNo+1)+" / "+pageCount+"ページ";
  heading.append(title,eventName,details,data);
  page.append(heading);
  const table=document.createElement("table");table.className="roster-print-table";
  const colgroup=document.createElement("colgroup");
  for(const width of ["11mm","16mm","20mm","35mm","28mm","25mm","22mm","33mm"]){
   const col=document.createElement("col");col.style.width=width;colgroup.append(col);
  }
  table.append(colgroup);
  const thead=document.createElement("thead"),trhead=document.createElement("tr");
  for(const label of ["✓","参加者ID","職員番号","氏名","所属","グループ","印刷時受付","手書き時刻・備考"]){
   const th=document.createElement("th");th.textContent=label;trhead.append(th);
  }
  thead.append(trhead);table.append(thead);
  const tbody=document.createElement("tbody");
  for(const item of rows.slice(pageNo*rowsPerPage,(pageNo+1)*rowsPerPage)){
   const tr=document.createElement("tr");if(item.extra)tr.className="roster-extra-row";
   const tdCheck=document.createElement("td");const box=document.createElement("span");box.className="roster-checkbox";box.setAttribute("aria-label","手書きチェック欄");tdCheck.append(box);tr.append(tdCheck);
   const p=item.person;
   const record=p?.checkins?.[session.id],isDone=p&&checked(p,session.id);
   const values=p?[p.id,p.staffId||"—",p.name,p.department||"—",p.group||"—",isDone?"済 "+localDate(record.lastAt||record.at).split(" ").pop().slice(0,5):"未",""] :["","","","","","",""];
   for(let ci=0;ci<values.length;ci++){
    const td=document.createElement("td");
    td.textContent=values[ci];
    if(ci===2){td.className="roster-name-cell";if(p)appendCustomDetails(td,e,p,"roster-custom");}
    if(ci===5)td.className=isDone?"roster-existing-done":"roster-existing-pending";
    tr.append(td);
   }
   tbody.append(tr);
  }
  table.append(tbody);page.append(table);
  const footer=document.createElement("div");footer.className="roster-print-footer";
  footer.textContent="□：紙の受付時にチェック／末尾の空行：飛び入り参加者の追記用　※印刷時点の控えです。紙の記録は復旧後に反映してください。";
  page.append(footer);root.append(page);
 }
 document.body.dataset.printMode="roster";
 root.hidden=false;
 try{markStep(e.id,"roster");window.print();}catch(err){document.body.removeAttribute("data-print-mode");root.hidden=true;announce("印刷画面を開けませんでした："+err.message,"error");}
}
function csvCell(v){let x=String(v??"");if(/^[\s]*[=+\-@\t\r\n]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"';}
function csvDownload(rows,filename){const text="\uFEFF"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n")+"\r\n";downloadBlob(new Blob([text],{type:"text/csv;charset=utf-8"}),filename);}
function downloadLink(url,filename){const a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();}
function downloadBlob(blob,filename){const u=URL.createObjectURL(blob);downloadLink(u,filename);setTimeout(()=>URL.revokeObjectURL(u),3000);}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").slice(0,15);}
function fileSafe(s){return String(s).replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,40);}
function participantRows(e){return e.participants.filter(p=>!p.removed).map(p=>[e.id,e.name,e.date,e.category,p.id,p.staffId,p.name,p.department,p.group||"",p.customValues?.[0],p.customValues?.[1],...e.sessions.map(s=>p.planned[s.id]?"○":"×")]);}
function exportRoster(){const e=current();csvDownload([["event_id","event_name","event_date","category","participant_id","staff_id","氏名","所属","グループ",e.customLabels[0]||"custom_1",e.customLabels[1]||"custom_2",...e.sessions.map(s=>s.name)],...participantRows(e)],"participants_"+fileSafe(e.id)+".csv");}
/* Registration template: header + one example row (names starting with （例） are skipped on import).
   Single-session events omit the session column: everyone is a target. */
const EXAMPLE_RE=/^[（(]\s*(記入)?例\s*[）)]/;
function templateRows(e){
 const head=["氏名","職員番号","所属","グループ"],ex=["（例）山田 太郎","00123","総務課","Aグループ"];
 e.customLabels.forEach((label,i)=>{if(!label?.trim())return;head.push(label.trim());const t=getCustomType(e,i);ex.push(t==="bool"?"有":t==="select"?(getCustomOptions(e,i)[0]||""):"（記入例）");});
 if(e.sessions.length>1)for(const s of e.sessions){head.push("受付区分："+s.name);ex.push("○");}
 return [head,ex];
}
function downloadTemplate(){const e=current();csvDownload(templateRows(e),"template_"+fileSafe(e.id)+".csv");announce("CSV形式のひな形を出力しました。Excelで開くと職員番号の先頭の0が消えるため、Excel形式のひな形をおすすめします。","success");}
function xmlEsc(v){return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"");}
function colName(i){let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}
async function xlsxBlob(rows,textCols,sheetName){
 const NS='xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',HEAD='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
 const width=rows[0].length,cols=Array.from({length:width},(_,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(i===0?20:16)+'" customWidth="1"'+(textCols.includes(i)?' style="1"':'')+'/>').join("");
 const data=rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>'<c r="'+colName(ci)+(ri+1)+'" t="inlineStr" s="'+(ri===0?(textCols.includes(ci)?3:2):(textCols.includes(ci)?1:0))+'"><is><t>'+xmlEsc(v)+'</t></is></c>').join("")+'</row>').join("");
 const files=[
  {name:"[Content_Types].xml",content:HEAD+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
  {name:"_rels/.rels",content:HEAD+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
  {name:"xl/workbook.xml",content:HEAD+'<workbook '+NS+' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+xmlEsc(sheetName)+'" sheetId="1" r:id="rId1"/></sheets></workbook>'},
  {name:"xl/_rels/workbook.xml.rels",content:HEAD+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
  {name:"xl/styles.xml",content:HEAD+'<styleSheet '+NS+'><fonts count="2"><font><sz val="11"/><name val="游ゴシック"/></font><font><b/><sz val="11"/><name val="游ゴシック"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2F0F1"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
  {name:"xl/worksheets/sheet1.xml",content:HEAD+'<worksheet '+NS+'><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+cols+'</cols><sheetData>'+data+'</sheetData></worksheet>'}];
 if(typeof JSZip!=="function")throw Error("ファイル作成ライブラリ（JSZip）がありません");
 const zip=new JSZip();for(const f of files)zip.file(f.name,f.content);
 return zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",compression:"DEFLATE"});
}
async function downloadTemplateXlsx(){
 const e=current();if(typeof JSZip!=="function")return announce("ファイル作成ライブラリ（JSZip）がありません。配信ファイルを確認してください。","error");
 try{downloadBlob(await xlsxBlob(templateRows(e),[1],"参加者"),"template_"+fileSafe(e.id)+".xlsx");
  announce("Excel形式のひな形を出力しました。職員番号の列は文字列に設定済みです。記入後、表を見出しごとコピーして「Excelから貼り付け」に貼り付けてください。","success");}
 catch(err){announce("ひな形を作成できません："+err.message,"error");}
}
const qrZipButtonLabel=document.getElementById("exportQRZip")?.innerHTML||"⇩ 一括ダウンロード（ZIP）";
async function exportQRZip(){
 const button=$("exportQRZip"),e=current(),people=eligibleQrPeople(e);const skipped=e.participants.filter(p=>!p.removed&&!validStaff(p.staffId)).length;
 if(!people.length)return announce("QR発行対象者がいません。","warn");
 if(typeof QRCode!=="function"||typeof JSZip!=="function")return announce("QR/ZIPライブラリがありません。配信ファイルを確認してください。","error");
 button.disabled=true;button.textContent="QRを生成中…";
 try{
  const customCols=customColumnIndices(e),zip=new JSZip(),csv=[["participant_id","name","staff_id","department","group",...customCols.map(i=>e.customLabels[i]),"qr_png_filename"]];
  const imgSize=360;
  for(let i=0;i<people.length;i++){
   const p=people[i],qr=document.createElement("div");
   new QRCode(qr,{text:p.staffId,width:imgSize,height:imgSize,correctLevel:QRCode.CorrectLevel.M});
   const qrImage=qrDataURL(qr);
   if(!qrImage)throw Error(p.name+" のQR画像を生成できません");
   const png=await qrCardDataURL(p,qrImage,e);
   const filename="QR_"+fileSafe(e.id)+"_"+p.id+".png";
   if(!/^data:image\/png;base64,/.test(png))throw Error(p.name+" のQR画像を読み取れません");
   zip.file(filename,png.slice(png.indexOf(",")+1),{base64:true});
   csv.push([p.id,p.name,p.staffId,p.department||"",p.group||"",...customCols.map(i=>customDisplayValue(e,p,i)),filename]);
   if((i+1)%20===0){button.textContent="生成中 "+(i+1)+"/"+people.length;await new Promise(resolve=>setTimeout(resolve,0));}
  }
  zip.file("qr_mapping.csv","\uFEFF"+csv.map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n");
  zip.file("README.txt","QR受付システム　QR配布用\nイベント: "+e.name+"\n開催日: "+e.date+"\n発行数: "+people.length+"\n\n画像はQR・氏名・職員番号・グループ・設定済みの追加項目が一体になった名刺型カードです。\n画像ファイル名と参加者の対応はqr_mapping.csvを確認してください。\nQRの内容は職員番号だけです。職員番号未登録者は発行対象外です。\n");
  const archive=await zip.generateAsync({type:"blob",mimeType:"application/zip",compression:"STORE"});
  downloadBlob(archive,"QR_reception_"+fileSafe(e.id)+"_"+stamp()+".zip");
  markStep(current().id,"qr");announce(people.length+"名分のQRと対応表をZIP出力しました。職員番号なし "+skipped+"名は除外しました。","success");
 }catch(err){announce("QRの一括発行に失敗しました："+err.message,"error");}
 finally{button.disabled=false;button.innerHTML=qrZipButtonLabel;}
}
function auditRows(e){
 const rows=[];
 for(const p of e.participants){
  for(const s of e.sessions){
   const c=p.checkins?.[s.id];if(!c)continue;
   rows.push([e.id,e.name,s.id,s.name,p.id,p.staffId,p.name,p.department,"受付",c.at,c.initialMethod||c.method||"qr",""]);
   for(const h of c.history||[]){
    rows.push([e.id,e.name,s.id,s.name,p.id,p.staffId,p.name,p.department,h.type==="cancel"?"取消":"再受付",h.at,h.method||"",h.reason||""]);
   }
   if(c.canceledAt&&!(c.history||[]).some(x=>x.type==="cancel"&&x.at===c.canceledAt)){
    rows.push([e.id,e.name,s.id,s.name,p.id,p.staffId,p.name,p.department,"取消",c.canceledAt,"",""]);
   }
  }
 }
 return rows.sort((a,b)=>String(a[9]).localeCompare(String(b[9])));
}
function exportAudit(){
 const e=current();
 csvDownload([["event_id","event_name","session_id","session_name","participant_id","staff_id","name","department","action","timestamp_utc","method","reason"],...auditRows(e)],"event_audit_"+fileSafe(e.id)+"_"+stamp()+".csv");
}

function detailHeader(){return ["event_id","event_name","event_date","category","session_id","session_name","participant_id","staff_id","name","department","group","custom_1_label","custom_1_value","custom_2_label","custom_2_value","planned","status","checked_in_at","last_checkin_at","method"];}
function detailRows(e,p){return e.sessions.map(s=>{const c=p.checkins[s.id],isChecked=checked(p,s.id);return [e.id,e.name,e.date,e.category,s.id,s.name,p.id,p.staffId,p.name,p.department,p.group||"",e.customLabels[0],p.customValues?.[0],e.customLabels[1],p.customValues?.[1],p.planned[s.id]?"1":"0",p.removed?"除外":isChecked?"受付済み":p.planned[s.id]?"未受付":"対象外",isChecked?localDate(c.at):"",isChecked?localDate(c.lastAt||c.at):"",isChecked?c.method:""];});}
function eventDetailCSV(){const e=current();csvDownload([detailHeader(),...e.participants.flatMap(p=>detailRows(e,p))],"event_result_"+fileSafe(e.id)+".csv");}
function renderResults(){
 const e=current(),records=e.sessions.map(s=>{
  const eligible=e.participants.filter(p=>!p.removed&&p.planned[s.id]);
  return {expected:eligible.length,done:eligible.filter(p=>checked(p,s.id)).length};
 });
 const planned=records.reduce((n,r)=>n+r.expected,0),done=records.reduce((n,r)=>n+r.done,0);
 $("sessionStats").innerHTML=
  '<div class="out-stat out-stat-total"><span>受付状況</span><strong>'+done+' / '+planned+'</strong><small>名（受付済 / 予定）</small></div>'+
  '<div class="out-stat"><span>✓ 受付済み</span><strong>'+done+'</strong><small>名</small></div>'+
  '<div class="out-stat"><span>◷ 未受付</span><strong>'+(planned-done)+'</strong><small>名</small></div>';
 $("outStatsNote").textContent=e.sessions.length>1?"全受付区分の延べ人数":"選択中イベントの集計";
 const select=$("rosterSession"),previous=select.value;
 select.replaceChildren();
 for(const s of e.sessions)select.add(new Option(s.name,s.id));
 select.value=e.sessions.some(s=>s.id===previous)?previous:e.sessions[0].id;
}
function filteredCross(){const type=$("crossPeriod").value,year=+$("crossYear").value,cat=$("crossCategory").value,status=$("crossStatus").value,q=$("crossQuery").value.trim().toLowerCase();const records=[];for(const e of db.values()){if(cat!=="all"&&e.category!==cat)continue;if(type!=="all"){if(!Number.isInteger(year)||year<2000||year>2100||!e.date)continue;const a=type==="fiscal"?year+"-04-01":year+"-01-01",b=type==="fiscal"?(year+1)+"-04-01":(year+1)+"-01-01";if(e.date<a||e.date>=b)continue;}for(const p of e.participants.filter(p=>!p.removed)){const st=statusFor(e,p);if(status==="checked"&&st!=="受付済み"&&st!=="一部受付")continue;if(status==="partial"&&st!=="一部受付")continue;if(status==="pending"&&st!=="未受付")continue;if(q&&![e.name,e.id,p.id,p.name,p.staffId,p.department,p.group,customSearchText(e,p)].join(" ").toLowerCase().includes(q))continue;records.push({e,p,status:st});}}return records.sort((a,b)=>b.e.date.localeCompare(a.e.date)||a.e.id.localeCompare(b.e.id)||a.p.id.localeCompare(b.p.id));}
function renderCross(){const records=filteredCross(),tbody=$("crossRows");tbody.replaceChildren();for(const {e,p,status} of records){const tr=document.createElement("tr");for(const x of [e.id,e.date,e.name,p.id,p.staffId,p.name,p.department,p.group,status]){const td=document.createElement("td");td.textContent=x||"—";tr.append(td);}tr.lastChild.innerHTML='<span class="cross-status '+(status==="受付済み"?"done":status==="一部受付"?"partial":"pending")+'">'+esc(status||"—")+'</span>';tr.firstChild.className="code";const custom=customEntries(e,p);if(custom.length){const details=document.createElement("div");details.className="cross-custom";for(const x of custom){const line=document.createElement("small");line.textContent=x.label+"："+x.value;details.append(line);}tr.children[5].append(details);}tbody.append(tr);}$("crossCount").textContent=records.length+"件";const people=new Set(records.filter(({p})=>p.staffId).map(({p})=>p.staffId));$("crossSummary").innerHTML=summaryMetric("イベント",new Set(records.map(({e})=>e.id)).size)+summaryMetric("参加記録",records.length)+summaryMetric("職員番号あり・実人数",people.size);}
function exportCross(detail){const found=filteredCross();if(detail){csvDownload([detailHeader(),...found.flatMap(({e,p})=>detailRows(e,p))],"cross_sessions_"+stamp()+".csv");}else{const head=["event_id","event_name","event_date","category","participant_id","staff_id","name","department","group","planned_sessions","checked_sessions","status"];const rows=found.map(({e,p,status})=>[e.id,e.name,e.date,e.category,p.id,p.staffId,p.name,p.department,p.group||"",e.sessions.filter(s=>p.planned[s.id]).length,e.sessions.filter(s=>checked(p,s.id)).length,status]);csvDownload([head,...rows],"cross_participants_"+stamp()+".csv");}}
/* Manual, event-scoped attendance exchange. Source snapshots contain only records authored on this PC.
   Master imports are repeat-safe by source device + revision, and never silently overwrite
   a check-in or cancellation that was edited on another PC. */
const ATTENDANCE_FORMAT="QRReception:attendance:v1";
function buildAttendanceSnapshot(e,sourceId=deviceId(),revision=localSyncRevision(e.id),master=isMaster()){
 const records=[];
 for(const p of e.participants){
  if(p.removed)continue;
  for(const session of e.sessions){
   const c=p.checkins?.[session.id];
   if(!c||(c.syncOrigin!==sourceId&&!(master&&!c.syncOrigin)))continue;
   records.push({participant_id:p.id,staff_id:p.staffId||"",session_id:session.id,checkin:clone(c)});
  }
 }
 return {format:ATTENDANCE_FORMAT,event_id:e.id,event_name:e.name,
  attendance_epoch:attendanceEpoch(e),source_device_id:sourceId,revision,
  exported_at:iso(),session_ids:e.sessions.map(x=>x.id),records};
}
function exportAttendanceSnapshot(){
 const e=current();if(!e)return;
 const payload=buildAttendanceSnapshot(e);
 if(!payload.records.length)return announce("このPCで記録した受付実績はまだありません。","warn");
 downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"}),
 "QR_attendance_"+fileSafe(e.id)+"_"+fileSafe(deviceId())+"_"+stamp()+".json");
 announce("このPCの受付実績 "+payload.records.length+"件を書き出しました。共有フォルダ等に保存してください。","success");
}
function validateAttendanceSnapshot(e,data,localDeviceId=deviceId()){
 if(!data||data.format!==ATTENDANCE_FORMAT)throw Error("受付実績JSONの形式が正しくありません。");
 if(data.event_id!==e.id)throw Error("イベントIDが異なります。最初に同じ全イベントJSONを配布してください。");
 if(data.attendance_epoch!==attendanceEpoch(e))throw Error("受付データの世代が異なります。受付状況のクリア後などは、最新の全イベントJSONを各PCに再配布してください。");
 if(typeof data.source_device_id!=="string"||!/^PC-[A-F0-9]{16}$/.test(data.source_device_id))throw Error("出力元PCの識別子が不正です。");
 if(data.source_device_id===localDeviceId)throw Error("このPC自身の実績ファイルは取り込めません。");
 if(!Number.isSafeInteger(data.revision)||data.revision<0)throw Error("受付実績の更新番号が不正です。");
 if(!Array.isArray(data.session_ids)||data.session_ids.length!==e.sessions.length
   ||data.session_ids.some((x,i)=>x!==e.sessions[i].id))throw Error("受付区分IDが一致しません。元の共通JSONから準備してください。");
 if(!Array.isArray(data.records)||data.records.length>10000)throw Error("受付実績の件数が不正です。");
 const participants=new Map(e.participants.filter(p=>!p.removed).map(p=>[p.id,p]));
 const sessions=new Set(e.sessions.map(s=>s.id)),seen=new Set(),records=[];
 for(const rec of data.records){
  if(!rec||typeof rec!=="object")throw Error("受付実績の内容が不正です。");
  const p=participants.get(rec.participant_id),sid=rec.session_id,checkin=rec.checkin;
  if(!p||!sessions.has(sid)||staffKey(rec.staff_id)!==staffKey(p.staffId))throw Error("参加者ID・職員番号・受付区分IDがマスターと一致しません。");
  const k=p.id+"|"+sid;if(seen.has(k))throw Error("同一参加者・区分の記録が重複しています。");seen.add(k);
  if(!checkin||typeof checkin!=="object"||Array.isArray(checkin)||typeof checkin.at!=="string"
    ||!Number.isFinite(Date.parse(checkin.at))||!Array.isArray(checkin.history)
    ||(checkin.active!==undefined&&typeof checkin.active!=="boolean")
    ||(checkin.syncOrigin&&checkin.syncOrigin!==data.source_device_id))throw Error("受付履歴のデータ形式が不正です。");
  records.push({participant:p,sessionId:sid,checkin:{...clone(checkin),syncOrigin:data.source_device_id}});
 }
 return records;
}
function planAttendanceImport(e,data,localDeviceId=deviceId()){
 const records=validateAttendanceSnapshot(e,data,localDeviceId);
 const lastRevision=Number(e.attendanceImports?.[data.source_device_id]??-1);
 const stale=data.revision<=lastRevision;
 const planned={add:[],update:[],same:[],conflict:[],stale,revision:data.revision,
  previousRevision:lastRevision,source:data.source_device_id};
 if(stale)return planned;
 for(const item of records){
  const currentRecord=item.participant.checkins?.[item.sessionId];
  if(!currentRecord){planned.add.push(item);continue;}
  const same=JSON.stringify({...currentRecord,syncOrigin:item.checkin.syncOrigin})===JSON.stringify(item.checkin);
  if(currentRecord.syncOrigin===data.source_device_id){
   (same?planned.same:planned.update).push(item);
  }else if(same){planned.same.push(item);}
  else planned.conflict.push(item);
 }
 return planned;
}
function applyAttendanceImport(e,data,plan,useIncomingConflicts=false){
 if(plan.stale)return {added:0,updated:0,conflicts:0};
 const next=clone(e),people=new Map(next.participants.map(p=>[p.id,p]));
 const install=item=>{people.get(item.participant.id).checkins[item.sessionId]=clone(item.checkin);};
 for(const item of [...plan.add,...plan.update])install(item);
 if(useIncomingConflicts)for(const item of plan.conflict)install(item);
 next.attendanceImports||={};next.attendanceImports[data.source_device_id]=data.revision;
 validateEvent(next);
 return {event:next,added:plan.add.length,updated:plan.update.length+(useIncomingConflicts?plan.conflict.length:0),
  conflicts:useIncomingConflicts?0:plan.conflict.length,unchanged:plan.same.length};
}
async function importAttendanceFile(file){
 if(!checkMaster("受付実績の取り込み"))return;
 if(!file)return;
 if(file.size>20*1024*1024)return announce("受付実績ファイルが大きすぎます（20MB以内）。","error");
 const e=current();if(!e)return;
 let data,plan;
 try{data=JSON.parse(await file.text());plan=planAttendanceImport(e,data);}
 catch(err){return announce("実績ファイルを取り込めません："+err.message,"error");}
 const panel=document.createElement("div");panel.className="rx-import-preview";
 const title=document.createElement("p");title.className="rx-import-file";title.textContent=file.name;panel.append(title);
 const summary=document.createElement("p");summary.className="rx-import-summary";
 summary.textContent="出力元："+data.source_device_id+" ／ 新規："+plan.add.length+"件・更新："+plan.update.length+
  "件・変更なし："+plan.same.length+"件・要確認："+plan.conflict.length+"件";
 panel.append(summary);
 if(plan.stale){const note=document.createElement("p");note.className="hint";note.textContent="同じPCの同一版または古いファイルです。すでに取り込み済みのため変更しません。";panel.append(note);}
 if(plan.conflict.length){
  const warning=document.createElement("p");warning.className="rx-import-warning";
  warning.textContent="異なるPCの操作が重なった記録があります。自動では上書きしません。";panel.append(warning);
  const list=document.createElement("div");list.className="rx-import-conflict-list";
  for(const item of plan.conflict.slice(0,30)){
   const el=document.createElement("div");const existing=item.participant.checkins[item.sessionId];
   const ss=e.sessions.find(x=>x.id===item.sessionId);
   el.textContent=item.participant.name+" ／ "+ss.name+"：マスター側 "+(existing.active===false?"取消済み":"受付済み")+"、ファイル側 "+(item.checkin.active===false?"取消済み":"受付済み");list.append(el);
  }
  panel.append(list);
  const choice=document.createElement("label");choice.className="check rx-import-override";
  const ck=document.createElement("input");ck.type="checkbox";ck.id="importUseIncomingConflicts";
  choice.append(ck,document.createTextNode("要確認の記録は、ファイル側の内容を優先して上書きする"));panel.append(choice);
 }
 const actions=document.createElement("div");actions.className="delete-dialog-buttons";
 const cancel=document.createElement("button");cancel.type="button";cancel.className="btn";cancel.textContent="キャンセル";cancel.onclick=closeDialog;
 const accept=document.createElement("button");accept.type="button";accept.className="btn main";accept.textContent="この実績を取り込む";accept.disabled=plan.stale||(!plan.add.length&&!plan.update.length&&!plan.conflict.length);
 accept.onclick=()=>{
  if(!checkMaster("受付実績の取り込み"))return;
  if(activeId!==e.id)return announce("イベントが変更されています。取り込みをやり直してください。","warn");
  const useIncoming=!!panel.querySelector("#importUseIncomingConflicts")?.checked;
  if(useIncoming&&!confirm("要確認の記録 "+plan.conflict.length+"件を、ファイル側の状態で上書きします。よろしいですか？"))return;
  let fresh;
  try{const currentEvent=current();const currentPlan=planAttendanceImport(currentEvent,data);if(currentPlan.stale)throw Error("取り込み済みのファイルです。");
    fresh=applyAttendanceImport(currentEvent,data,currentPlan,useIncoming);
  }catch(err){return announce("取り込みに失敗しました："+err.message,"error");}
  if(!fresh.event||!writeEvent(fresh.event))return;
  closeDialog();render({keepScroll:true});
  announce("受付実績を取り込みました：新規 "+fresh.added+"件、更新 "+fresh.updated+"件、競合保留 "+fresh.conflicts+"件。","success");
 };
 actions.append(cancel,accept);panel.append(actions);
 openDialog("受付実績の取り込み確認",panel);
}
function backup(){const payload={schema_version:SCHEMA,exported_at:iso(),events:[...order].filter(x=>db.has(x)).map(x=>clone(db.get(x)))};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"}),"QRReception_backup_"+stamp()+".json");meta.lastBackupAt=iso();saveMeta();renderBackupStatus();announce(payload.events.length+"件のJSONダウンロードを開始しました。ファイルが保存されたことを確認してください。","success");}

// Removes only the current application namespace. Do not touch browser-wide or legacy prototype data.
function deleteAllStoredData(){
 const entries=[];
 try{
  for(let i=0;i<localStorage.length;i++){
   const k=localStorage.key(i);
   if(k===IX||k===META||k?.startsWith(PREFIX))entries.push([k,localStorage.getItem(k)]);
  }
 }catch(err){announce("削除対象を確認できません："+err.message,"error");return;}
 try{
  for(const [k] of entries)localStorage.removeItem(k);
 }catch(err){
  let restored=true;
  for(const [k,v] of entries){
   try{if(v!==null)localStorage.setItem(k,v);}catch{restored=false;}
  }
  announce("データの削除に失敗しました。"+(restored?"元のデータは復旧しました。":"一部復旧できない可能性があります。JSONから復元してください。")+" "+err.message,"error");
  return;
 }
 db.clear();order=[];meta={};activeId=null;view="home";homeTab="events";day=false;receptionTab="pending";
 closeDialog();render();
 announce("このアプリの全イベント・参加者・受付履歴を削除しました。","success");
}
function openDeleteAllDialog(){
 const count=db.size,participants=[...db.values()].reduce((n,e)=>n+e.participants.length,0);
 const content=document.createElement("div");
 content.innerHTML='<div class="delete-confirm"><strong>取り消せない操作です</strong>このブラウザに保存された全'+count+'イベント・参加者'+participants+'名分の情報と受付履歴を削除します。<br>先にJSONバックアップを保存してください。</div>'+
 '<div class="buttons" style="margin-bottom:18px"><button type="button" class="btn" id="backupBeforeDelete">⇩ 先にJSONバックアップ</button></div>'+
 '<label class="field">確認のため「全削除」と入力してください<input type="text" id="deletePhrase" autocomplete="off" placeholder="全削除"></label>'+
 '<div class="delete-dialog-buttons"><button type="button" class="btn" id="cancelDeleteAll">キャンセル</button><button type="button" class="btn danger" id="confirmDeleteAll" disabled>すべて削除する</button></div>';
 openDialog("全データ削除",content);
 $("backupBeforeDelete").onclick=backup;
 $("cancelDeleteAll").onclick=closeDialog;
 $("deletePhrase").addEventListener("input",()=>{$("confirmDeleteAll").disabled=$("deletePhrase").value.trim()!=="全削除";});
 $("confirmDeleteAll").onclick=()=>{
  if($("deletePhrase").value.trim()!=="全削除")return;
  if(!confirm("最終確認：このブラウザのQR受付システムの全イベントと受付履歴を削除します。実行しますか？"))return;
  deleteAllStoredData();
 };
 $("deletePhrase").focus();
}

async function restore(){const f=$("restoreFile").files[0];if(!f)return announce("復元するJSONファイルを選択してください。","warn");let data;try{data=JSON.parse(await f.text());if(data.schema_version!==SCHEMA||!Array.isArray(data.events))throw Error("未対応のバックアップ形式です");const seen=new Set();for(const e of data.events){validateEvent(e);if(seen.has(e.id))throw Error("イベントIDが重複しています");seen.add(e.id);}}catch(err){return announce("JSONの検証に失敗しました："+err.message,"error");}
const mode=$("restoreMode").value,existing=data.events.filter(e=>db.has(e.id)).length,records=data.events.filter(e=>!db.has(e.id)||mode==="replace");if(!records.length)return announce("追加するイベントがありません（既存は保持）。","warn");if(!confirm(data.events.length+"件のバックアップを読み込みます。\n新規・更新："+records.length+"件／既存との重複："+existing+"件\n方式："+(mode==="skip"?"既存を保持":"重複するイベントを上書き")+"\n実行しますか？"))return;if(mode==="replace"&&existing&&!confirm("既存イベントをバックアップ側のデータで上書きします。現在の受付記録が失われる可能性があります。本当に実行しますか？"))return;
const previous=records.map(e=>[e.id,localStorage.getItem(key(e.id))]),newIds=[...order,...records.map(e=>e.id).filter(id=>!order.includes(id))];try{for(const e of records)localStorage.setItem(key(e.id),JSON.stringify(e));localStorage.setItem(IX,JSON.stringify({version:SCHEMA,ids:newIds}));for(const e of records)db.set(e.id,e);order=newIds;markChanged();render();announce(records.length+"件を復元しました。","success");}catch(err){for(const [id,old] of previous){try{if(old===null)localStorage.removeItem(key(id));else localStorage.setItem(key(id),old);}catch{}}announce("復元に失敗しました。可能な限り元のデータに戻しました："+err.message,"error");}}
function csvParse(text){let i=0,inQuotes=false,field="",row=[],out=[];text=text.replace(/^\uFEFF/,"");while(i<text.length){const ch=text[i++];if(inQuotes){if(ch==='"'){if(text[i]==='"'){field+='"';i++;}else inQuotes=false;}else field+=ch;}else if(ch==='"'){inQuotes=true;}else if(ch===","){row.push(field);field="";}else if(ch==="\r"||ch==="\n"){if(ch==="\r"&&text[i]==="\n")i++;row.push(field);if(row.some(x=>x.trim()))out.push(row);field="";row=[];}else field+=ch;}if(inQuotes)throw Error("CSVの引用符が閉じられていません");if(field||row.length){row.push(field);if(row.some(x=>x.trim()))out.push(row);}return out;}

const CSV_FIELDS=[
 ["name","氏名（必須）",["氏名","name","名前"]],
 ["staffId","職員番号",["職員番号","staff_id"]],
 ["participantId","参加者ID（更新用）",["participant_id","参加者ID"]],
 ["department","所属",["所属","department"]],
 ["group","グループ",["グループ","group"]],
 ["custom0","任意項目1",["custom_1"]],
 ["custom1","任意項目2",["custom_2"]]
];
let csvPending=null;
function csvMapping(){
 const obj={};
 for(const el of document.querySelectorAll("[data-csv-field]"))obj[el.dataset.csvField]=Number(el.value);
 for(const radio of document.querySelectorAll("[data-csv-session-mode]:checked")){
  const id=radio.dataset.csvSessionMode;
  obj["session:"+id]=radio.value==="all"?-2:radio.value==="column"?Number(document.querySelector('[data-csv-session-column="'+id+'"]').value):-1;
 }
 return obj;
}
function mappedValue(row,m,key){const idx=m[key];return Number.isInteger(idx)&&idx>=0?String(row[idx]??"").trim():null;}
function prepareCsv(rows,m,mode,e){
 if(!Number.isInteger(m.name)||m.name<0)throw Error("氏名の列を指定してください");
 const fields=Object.entries(m).filter(([k,v])=>v>=0);
 const selected=new Set();for(const [field,index]of fields){if(selected.has(index))throw Error("同じCSV列を複数項目に割り当てられません（"+field+"）");selected.add(index);}
 const plans=[],seen=new Set();let invalid=0,skip=0,adds=0,updates=0,blank=0,nonTarget=0,example=0;
 for(let ri=1;ri<rows.length;ri++){
  const row=rows[ri],name=mappedValue(row,m,"name");
  if(!name){blank++;continue;}
  if(EXAMPLE_RE.test(name)){example++;continue;}
  if(name.length>200)throw Error((ri+1)+"行目：氏名が長すぎます");
  const rawStaff=mappedValue(row,m,"staffId"),staff=rawStaff===null?null:normStaff(rawStaff),pid=mappedValue(row,m,"participantId");
  if(staff&&!validStaff(staff))throw Error((ri+1)+"行目：職員番号は半角英数字（ハイフンなし）にしてください（値："+staff.slice(0,30)+"）");
  const byPid=pid?e.participants.find(p=>p.id===pid):null;
  const byStaff=staff?e.participants.find(p=>p.staffId&&staffKey(p.staffId)===staffKey(staff)):null;
  if(pid&&!byPid)throw Error((ri+1)+"行目：参加者ID "+pid+" はこのイベントにありません");
  if(byPid&&byStaff&&byPid.id!==byStaff.id)throw Error((ri+1)+"行目：参加者IDと職員番号の対応が不一致です");
  if(byPid&&staff&&byPid.staffId&&staffKey(byPid.staffId)!==staffKey(staff))throw Error((ri+1)+"行目：登録済みの職員番号と一致しません");
  const exists=byPid||byStaff;
  if(exists?.removed)throw Error((ri+1)+"行目：除外済みの参加者は一括更新できません");
  const unique=exists?"id:"+exists.id:staff?"staff:"+staffKey(staff):null;
  if(unique&&seen.has(unique)){skip++;continue;}
  if(unique)seen.add(unique);
  const values={name,staffId:staff,department:mappedValue(row,m,"department"),group:mappedValue(row,m,"group"),custom0:mappedValue(row,m,"custom0"),custom1:mappedValue(row,m,"custom1")};
  for(let i=0;i<2;i++)if(values["custom"+i]!==null){try{values["custom"+i]=normalizeCustom(e,i,values["custom"+i]);}catch(err){throw Error((ri+1)+"行目："+err.message);}}
  const planned={};
  for(const s of e.sessions){if(m["session:"+s.id]===-2){planned[s.id]=true;continue;}const v=mappedValue(row,m,"session:"+s.id);if(v===""&&e.sessions.length===1)continue;if(v!==null){try{planned[s.id]=globalThis.QRSupport.participation(v);}catch(err){throw Error((ri+1)+"行目「"+s.name+"」："+err.message);} }}
  if(exists){
   if(mode==="skip"){skip++;continue;}
   for(const s of e.sessions)if(planned[s.id]===false&&checked(exists,s.id))throw Error((ri+1)+"行目：受付済みの「"+s.name+"」を参加対象外にはできません");
   plans.push({kind:"update",id:exists.id,values,planned});updates++;
  }else{
   const plannedNew=Object.fromEntries(e.sessions.map(s=>[s.id,Object.hasOwn(planned,s.id)?planned[s.id]:e.sessions.length===1]));
   if(!Object.values(plannedNew).some(Boolean))nonTarget++;
   plans.push({kind:"add",values,planned:plannedNew});adds++;
  }
 }
 return{plans,adds,updates,skip,blank,nonTarget,example};
}
function renderCsvSample(mapping){
 const root=$("csvDataSample");root.replaceChildren();
 const cols=[["name","氏名"],["staffId","職員番号"],["department","所属"],["group","グループ"]];
 const table=document.createElement("table"),thead=document.createElement("thead"),head=document.createElement("tr");
 for(const [,label] of cols){const th=document.createElement("th");th.textContent=label;head.append(th);}thead.append(head);table.append(thead);
 const body=document.createElement("tbody");
 const rows=csvPending.rows.slice(1).filter(row=>{const name=mappedValue(row,mapping,"name");return name&&!EXAMPLE_RE.test(name);}).slice(0,5);
 for(const row of rows){const tr=document.createElement("tr");for(const [key] of cols){const td=document.createElement("td");td.textContent=mappedValue(row,mapping,key)??"—";tr.append(td);}body.append(tr);}
 if(!rows.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=cols.length;td.textContent="表示できるデータ行はありません";tr.append(td);body.append(tr);}
 table.append(body);root.append(table);
}
function previewCsvImport(){
 if(!csvPending)return;
 const e=current(),mapping=csvMapping(),mode=$("csvConflictMode").value,root=$("csvPreview");
 const core=["name","staffId","department","group"];
 const matched=core.filter(key=>mapping[key]>=0).length;
 $("csvMatchedCount").textContent=String(matched);
 $("csvMissingCount").textContent=String(core.length-matched);
 for(const select of document.querySelectorAll("[data-csv-field]")){
  const holder=select.closest(".ci-map-field"),assigned=Number(select.value)>=0;
  if(holder){const required=select.dataset.csvField==="name";holder.classList.toggle("ci-not-mapped",!assigned&&required);holder.classList.toggle("ci-unused",!assigned&&!required);const status=holder.querySelector(".ci-map-state");if(status)status.textContent=assigned?"✓ 対応済み":required?"要設定":"未使用";}
 }
 for(const radio of document.querySelectorAll("[data-csv-session-mode]:checked")){
  const wrap=document.querySelector('[data-csv-session-column-wrap="'+radio.dataset.csvSessionMode+'"]');
  if(wrap)wrap.hidden=radio.value!=="column";
 }
 renderCsvSample(mapping);
 try{
  for(const radio of document.querySelectorAll('[data-csv-session-mode]:checked')){
   if(radio.value==="column"&&mapping["session:"+radio.dataset.csvSessionMode]<0)
    throw Error("「"+radio.dataset.sessionLabel+"」の参加予定を表すExcel列を選択してください。");
  }
  const plan=prepareCsv(csvPending.rows,mapping,mode,e);
  const top=$("csvTopAlert");top.hidden=!plan.nonTarget;if(plan.nonTarget){top.className="ci-warning";top.textContent="⚠ 参加予定がない新規登録者が "+plan.nonTarget+"名います。受付区分を設定しないと当日の未受付一覧に表示されません。下の「参加予定の設定」を確認してください。";}
  root.innerHTML='<div class="ci-result-label">取り込み予定</div><div class="ci-result-stats">'+
   '<div><strong>'+plan.adds+'</strong><span>新規登録</span></div>'+
   '<div><strong>'+plan.updates+'</strong><span>既存を更新</span></div>'+
   '<div><strong>'+plan.skip+'</strong><span>スキップ</span></div></div>'+
   ((plan.blank||plan.example)?'<p class="ci-info-note">氏名が空欄：'+plan.blank+'行'+(plan.example?'　／　記入例：'+plan.example+'行':'')+'（取り込み対象外）</p>':'')+
   '';
  $("csvCommit").disabled=plan.plans.length===0;
  $("csvCommit").textContent=plan.plans.length?plan.plans.length+"名を取り込む →":"取り込み対象がありません";
  $("csvFooterSummary").textContent="新規 "+plan.adds+"名・更新 "+plan.updates+"名・スキップ "+plan.skip+"名";
  return plan;
 }catch(err){
  const top=$("csvTopAlert");top.hidden=false;top.className="ci-warning ci-error";top.textContent="確認が必要です："+err.message;
  root.replaceChildren();const n=document.createElement("div");n.className="ci-warning ci-error";n.setAttribute("role","alert");n.textContent="確認が必要です："+err.message;root.append(n);
  $("csvCommit").disabled=true;$("csvFooterSummary").textContent="列の対応を確認してください";return null;
 }
}
function commitCsvImport(){
 if(!csvPending)return;
 const plan=previewCsvImport();if(!plan)return;
 if(!confirm("名簿を更新します。新規 "+plan.adds+"名、更新 "+plan.updates+"名、スキップ "+plan.skip+"名。実行しますか？"))return;
 const ok=mutate(e=>{
  for(const item of plan.plans){
   if(item.kind==="update"){
    const p=e.participants.find(p=>p.id===item.id);
    if(!p||p.removed)throw Error("対象者が見つかりません");
    const v=item.values;
    p.name=v.name;
    if(v.staffId!==null&&v.staffId)p.staffId=v.staffId;
    if(v.department!==null)p.department=v.department;
    if(v.group!==null)p.group=v.group;
    if(!Array.isArray(p.customValues))p.customValues=["",""];
    if(v.custom0!==null)p.customValues[0]=v.custom0;
    if(v.custom1!==null)p.customValues[1]=v.custom1;
    Object.assign(p.planned,item.planned);
   }else{
    const v=item.values;
    e.participants.push({id:String(e.nextParticipant++).padStart(4,"0"),name:v.name,staffId:v.staffId||"",department:v.department||"",group:v.group||"",customValues:[v.custom0||"",v.custom1||""],planned:item.planned,checkins:{},source:"pre",removed:false});
   }
  }
 });
 if(ok){const src=csvPending?.source;closeDialog();csvPending=null;$("participantFile").value="";if(src==="paste")$("participantPaste").value="";
 $("participantImportDetails").open=false;setParticipantPage(1);
 announce("参加者登録完了：新規 "+plan.adds+"名、更新 "+plan.updates+"名、スキップ "+plan.skip+"名","success");}
}
async function importParticipants(){
 const file=$("participantFile").files?.[0];if(!file)return announce("CSVファイルを選択してください。","warn");
 if(file.size>5*1024*1024)return announce("CSVが大きすぎます。5MB以下に分けてください。","warn");
 let rows;try{
  if(!globalThis.QRSupport)throw Error("CSV処理ライブラリがありません");
  const raw=await file.arrayBuffer();
  rows=globalThis.QRSupport.parseCSV(globalThis.QRSupport.decodeCSV(raw));
  if(rows.length<2)throw Error("データ行がありません");
  if(rows.length>10001)throw Error("10,000行以下に分割してください");
  if(rows[0].length>100)throw Error("列数が多すぎます");
 }catch(err){return announce("CSVを読み込めません："+err.message,"error");}
 showImportPreview(rows,"csv");
}
/* 貼り付けデータの区切り文字（タブ／カンマ）を、先頭の論理行で判定する。引用符内のカンマ・改行は数えない。
   画面側（貼り付け取り込み）の処理としてここに置く。 */
function detectPasteDelimiter(text){
 const input=String(text??"").replace(/^\uFEFF/,"");let quoted=false,tabs=0,commas=0;
 for(let i=0;i<input.length;i++){
  const ch=input[i];
  if(ch==='"'){
   if(quoted&&input[i+1]==='"'){i++;continue;}
   quoted=!quoted;continue;
  }
  if(!quoted){
   if(ch==="\t")tabs++;
   else if(ch===",")commas++;
   else if(ch==="\r"||ch==="\n")break;
  }
 }
 if(tabs&&commas&&tabs===commas)throw Error("タブ区切りとカンマ区切りの判定ができません。列見出しを確認してください");
 return tabs>=commas?"tab":"comma";
}
function parsePastedTable(text){
 const rows=detectPasteDelimiter(text)==="tab"?globalThis.QRSupport.parseTSV(text):globalThis.QRSupport.parseCSV(text);
 if(!rows.length)throw Error("貼り付けられた表データがありません");
 return rows;
}
function importFromPaste(){
 const input=$("participantPaste").value;
 if(!input.trim())return announce("Excelの表やCSVデータを見出し行から貼り付けてください。","warn");
 if(input.length>5*1024*1024)return announce("貼り付け内容が多すぎます。分割してください。","warn");
 let rows;try{
  if(!globalThis.QRSupport)throw Error("CSV処理ライブラリがありません");
  rows=parsePastedTable(input);
  if(rows.length<2)throw Error("見出し行とデータ行が必要です");
  if(rows.length>10001)throw Error("10,000行以下に分割してください");
  if(rows[0].length>100)throw Error("列数が多すぎます");
 }catch(err){return announce("貼り付け内容を確認してください："+err.message,"error");}
 showImportPreview(rows,"paste");
}
function setImportMode(mode){
 const pasted=mode!=="csv";
 $("pasteImportArea").hidden=!pasted;
 $("csvImportArea").hidden=pasted;
 for(const id of ["importTabPaste","importTabCsv"]){
  const btn=$(id),active=id===(pasted?"importTabPaste":"importTabCsv");
  btn.classList.toggle("active",active);btn.setAttribute("aria-selected",String(active));
 }
}

const IMPORT_FIELD_HELP={
 name:"氏名は必須です。Excelの氏名の列を選択してください。氏名が空欄の行は取り込み対象外です。",
 staffId:"同じ職員番号が登録済みなら初期設定ではスキップし、詳細設定で更新も選べます。職員番号のない人にはQRを発行できません。先頭の0を残してください。",
 participantId:"職員番号がない人など、既存の参加者をIDで特定して更新するときだけ使います。同じイベントから出力した参加者IDを指定してください。通常は未使用で問題ありません。",
 department:"参加者の所属部署の列です。Excelにない場合は未使用で構いません。",
 group:"グループの列です。使っていない場合は未使用で構いません。",
 custom0:"イベント設定の「追加の登録項目1」に対応するExcel列を指定します。不要であれば未使用にできます。",
 custom1:"イベント設定の「追加の登録項目2」に対応するExcel列を指定します。不要であれば未使用にできます。"
};
function importInfoHelp(name,description){
 const details=document.createElement("details");details.className="ci-help";
 const summary=document.createElement("summary");summary.textContent="ⓘ";summary.title=name+"の説明";summary.setAttribute("aria-label",name+"の説明");
 const tooltip=document.createElement("div");tooltip.className="ci-help-tooltip";tooltip.textContent=description;
 details.append(summary,tooltip);return details;
}
function importMapSelect(id,label,aliases,headers,compact=false){
 const wrap=document.createElement("div");wrap.className="field ci-map-field"+(compact?" ci-core-field":"");
 const title=document.createElement("div");title.className="ci-map-label";
 const text=document.createElement("label");text.htmlFor="ci-map-"+id;text.textContent=label;
 const help=importInfoHelp(label,IMPORT_FIELD_HELP[id]||"Excelから対応する列を読み込みます。未使用のままでも取り込めます。");
 const status=document.createElement("small");status.className="ci-map-state";
 const extras=document.createElement("span");extras.className="ci-map-extras";extras.append(help,status);title.append(text,extras);
 const select=document.createElement("select");select.id="ci-map-"+id;select.dataset.csvField=id;select.setAttribute("aria-label",label+"に対応するExcel列");
 select.add(new Option("列を割り当てない","-1"));
 headers.forEach((h,i)=>select.add(new Option((i+1)+"列目："+h,String(i))));
 select.value=String(globalThis.QRSupport.detectColumn(headers,aliases.filter(Boolean)));
 select.addEventListener("change",previewCsvImport);
 wrap.append(title,select);return wrap;
}
function importSessionChoice(s,headers,oneSession){
 const wrap=document.createElement("section");wrap.className="ci-session-item";
 const head=document.createElement("h4");head.textContent="受付区分："+s.name;wrap.append(head);
 const aliases=["受付区分："+s.name,"受付区分:"+s.name,s.name,"参加_"+s.name,s.name+"_参加"];
 const guess=globalThis.QRSupport.detectColumn(headers,aliases),initial=guess>=0?"column":oneSession?"all":"unassigned";
 const radios=document.createElement("div");radios.className="ci-radio-options";
 const key="ci-session-"+s.id;
 for(const [v,label] of [["all","全員を参加予定にする"],["column","Excelの列で指定する"],["unassigned","指定しない"]]){
  const item=document.createElement("label");item.className="ci-radio-choice";
  const input=document.createElement("input");input.type="radio";input.name=key;input.value=v;input.dataset.csvSessionMode=s.id;input.dataset.sessionLabel=s.name;input.checked=v===initial;input.addEventListener("change",previewCsvImport);
  item.append(input,document.createTextNode(label));radios.append(item);
 }
 wrap.append(radios);
 const columnWrap=document.createElement("label");columnWrap.className="field ci-session-column";columnWrap.dataset.csvSessionColumnWrap=s.id;columnWrap.textContent="参加予定を表すExcel列";
 const select=document.createElement("select");select.dataset.csvSessionColumn=s.id;select.add(new Option("列を選択してください","-1"));
 headers.forEach((h,i)=>select.add(new Option((i+1)+"列目："+h,String(i))));select.value=String(guess);select.addEventListener("change",previewCsvImport);
 columnWrap.append(select);columnWrap.hidden=initial!=="column";wrap.append(columnWrap);
 const hint=document.createElement("p");hint.className="ci-session-hint";hint.textContent="「指定しない」は新規登録者の参加予定を付けず、既存参加者の設定も変更しません。";wrap.append(hint);
 return wrap;
}
function showImportPreview(rows,source){
 csvPending={rows,eventId:activeId,source};
 const e=current(),headers=rows[0].map(x=>String(x).trim());
 const fieldMap=CSV_FIELDS.map(([id,label,aliases])=>({id,label:id==="custom0"?(e.customLabels[0]||"追加項目1"):id==="custom1"?(e.customLabels[1]||"追加項目2"):label,aliases:id==="custom0"?[e.customLabels[0],"custom_1"]:id==="custom1"?[e.customLabels[1],"custom_2"]:aliases}));
 const root=document.createElement("div");root.className="ci-import";
 const intro=document.createElement("p");intro.className="ci-intro";intro.textContent="列の対応と参加予定を確認してから登録します。正しく自動判定された項目は変更不要です。";root.append(intro);
 const summary=document.createElement("div");summary.className="ci-overview";
 for(const [id,value,label] of [["csvRowCount",rows.length-1,"読み取り行数"],["csvMatchedCount","0","対応済みの基本項目"],["csvMissingCount","0","未使用の基本項目"]]){
  const tile=document.createElement("div");tile.className="ci-overview-tile";const val=document.createElement("strong");val.id=id;val.textContent=String(value);const caption=document.createElement("span");caption.textContent=label;tile.append(val,caption);summary.append(tile);
 }
 root.append(summary);
 const topAlert=document.createElement("div");topAlert.id="csvTopAlert";topAlert.hidden=true;topAlert.setAttribute("role","alert");root.append(topAlert);
 const section=document.createElement("section");section.className="ci-section";
 const title=document.createElement("h3");title.textContent="✓ 基本的な列の対応";section.append(title);
 const note=document.createElement("p");note.className="ci-section-note";note.textContent="Excelの列名から自動判定しています。違う列が選ばれていた場合だけ変更してください。";section.append(note);
 const core=document.createElement("div");core.className="ci-core-mapping";
 for(const id of ["name","staffId","department","group"]){const field=fieldMap.find(f=>f.id===id);core.append(importMapSelect(field.id,field.label,field.aliases,headers,true));}
 section.append(core);root.append(section);
 const sessionSection=document.createElement("section");sessionSection.className="ci-section ci-session-section";
 const shRow=document.createElement("div");shRow.className="ci-heading-row";const sh=document.createElement("h3");sh.textContent="参加予定の設定";shRow.append(sh,importInfoHelp("参加予定の設定","受付区分ごとに参加する人を決めます。「全員を参加予定」は取り込む全員を対象にし、「Excelの列で指定」は列の○などで参加予定を読み込みます。「指定しない」は新規参加者を対象にせず、既存参加者の参加予定は変更しません。"));sessionSection.append(shRow);
 const sn=document.createElement("p");sn.className="ci-section-note";sn.textContent="受付区分ごとに、この名簿の参加者をどう登録するか指定します。";sessionSection.append(sn);
 for(const s of e.sessions)sessionSection.append(importSessionChoice(s,headers,e.sessions.length===1));
 root.append(sessionSection);
 const advanced=document.createElement("details");advanced.className="ci-advanced";
 const advancedSummary=document.createElement("summary");advancedSummary.textContent="詳細設定：追加項目・参加者ID・重複時の扱い";advanced.append(advancedSummary);
 const more=document.createElement("div");more.className="ci-advanced-body";
 const mappings=document.createElement("div");mappings.className="ci-extra-mapping";
 const extra=fieldMap.filter(x=>x.id==="participantId"||x.id==="custom0"&&e.customLabels?.[0]||x.id==="custom1"&&e.customLabels?.[1]);
 for(const field of extra)mappings.append(importMapSelect(field.id,field.label,field.aliases,headers));
 more.append(mappings);
 const conflict=document.createElement("div");conflict.className="field ci-conflict";const conflictHead=document.createElement("div");conflictHead.className="ci-map-label";const conflictLabel=document.createElement("label");conflictLabel.htmlFor="csvConflictMode";conflictLabel.textContent="同じ職員番号・参加者IDが登録されている場合";conflictHead.append(conflictLabel,importInfoHelp("重複時の扱い","既存の職員番号または参加者IDと一致する行は初期設定でスキップします。「更新」を選ぶと、氏名・所属などを上書きします。参加者IDと受付履歴は維持します。氏名だけでは重複判定しません。"));
 const mode=document.createElement("select");mode.id="csvConflictMode";mode.add(new Option("既存の参加者はスキップ（推奨）","skip"));mode.add(new Option("既存の参加者情報を更新（QR・受付履歴は保持）","update"));mode.value="skip";mode.addEventListener("change",previewCsvImport);
 conflict.append(conflictHead,mode);more.append(conflict);advanced.append(more);root.append(advanced);
 const sampleSec=document.createElement("section");sampleSec.className="ci-section ci-sample-section";
 const sampleTitle=document.createElement("h3");sampleTitle.textContent="取り込みプレビュー";sampleSec.append(sampleTitle);
 const sampleHint=document.createElement("p");sampleHint.className="ci-section-note";sampleHint.textContent="先頭の最大5名を表示します。表示される内容は上で指定した列に連動します。";sampleSec.append(sampleHint);
 const sample=document.createElement("div");sample.id="csvDataSample";sample.className="tablewrap ci-sample-table";sampleSec.append(sample);root.append(sampleSec);
 const preview=document.createElement("div");preview.id="csvPreview";preview.className="ci-results";preview.setAttribute("aria-live","polite");root.append(preview);
 const footer=document.createElement("div");footer.className="ci-footer";
 const cancel=document.createElement("button");cancel.type="button";cancel.className="btn";cancel.textContent="キャンセル";cancel.onclick=()=>{csvPending=null;closeDialog();};
 const right=document.createElement("div");right.className="ci-footer-action";const footnote=document.createElement("span");footnote.id="csvFooterSummary";footnote.className="ci-footer-summary";
 const commit=document.createElement("button");commit.type="button";commit.id="csvCommit";commit.className="btn main";commit.textContent="取り込む";commit.onclick=commitCsvImport;
 right.append(footnote,commit);footer.append(cancel,right);root.append(footer);
 openDialog("取り込み内容の確認",root);previewCsvImport();
}
function openDialog(title,body){dialogReturnFocus=document.activeElement;$("dialogTitle").textContent=title;$("dialogBody").replaceChildren(body);$("dialogBackdrop").hidden=false;$("closeDialog").focus();}
function closeDialog(){$("dialogBackdrop").hidden=true;$("dialogBody").replaceChildren();dialogReturnFocus?.focus?.();}
let inReception=false;
/* Backup remains available from the header and Data Management, without unsolicited dialogs. */
function render({keepScroll=false}={}){
 if(!isMaster()&&view==="event")day=true;
 applyOperatingModeUI();
 const home=view==="home",nowDay=!home&&day;
 if(nowDay&&!inReception)resetCameraPaused=false;
 inReception=nowDay;
 document.body.classList.toggle("day-mode",nowDay);document.body.classList.toggle("event-mode",!home&&!day);
 if((home||!day)&&CAM.running)stopCamera();
 $("homeView").hidden=!home;$("eventView").hidden=home;
 if(home)renderHome();else renderEvent(keepScroll);
 renderBackupStatus();
}
function delegate(){document.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
if(b.dataset.ptPage!==undefined){setParticipantPage(Number(b.dataset.ptPage));return;}
if(b.dataset.outputHelp!==undefined){
 const pop=b.closest(".out-export-help"),shouldOpen=!pop.classList.contains("is-open");
 for(const x of document.querySelectorAll("#resultsPanel .out-export-help.is-open")){
  x.classList.remove("is-open");x.querySelector(".out-info-trigger").setAttribute("aria-expanded","false");
 }
 if(shouldOpen){pop.classList.add("is-open");b.setAttribute("aria-expanded","true");}
 return;
}
if(b.dataset.home){homeTab=b.dataset.home;announce("");render();return;}
if(b.dataset.mode){day=b.dataset.mode==="day";announce("");render();return;}
if(b.dataset.prep){prepTab=b.dataset.prep;announce("");render();return;}
if(b.dataset.backup!==undefined){backup();return;}
if(b.dataset.newEvent!==undefined){addEvent();return;}
if(b.dataset.receptionTab){showReceptionTab(b.dataset.receptionTab);return;}
if(b.dataset.manualSort){changeManualSort(b.dataset.manualSort);return;}
if(b.dataset.manualPerson){manualCheck(b.dataset.manualPerson);return;}
if(b.dataset.receptionCheckin){quickReceptionCheckIn(b.dataset.receptionCheckin,b.dataset.sessionId);return;}
if(b.dataset.receptionCancel){quickReceptionCancel(b.dataset.receptionCancel,b.dataset.sessionId);return;}
if(b.dataset.menu){openEventMenu(b);return;}
if(b.dataset.listTab){listTab=b.dataset.listTab;renderEventList();return;}
if(b.dataset.action){closeEventMenu();const id=b.dataset.id;switch(b.dataset.action){case "results":return openEvent(id,false,"results");case "prep":return openEvent(id,false);case "day":return openEvent(id,true);case "clone":return addEvent(id);case "delete":return deleteEvent(id);case "edit-person":return openPerson(b.dataset.person,false);case "remove-session":return removeSession(b.dataset.session);}return;}
});
$("newEvent").onclick=()=>addEvent();$("backHome").onclick=()=>openHome();$("rxBack").onclick=()=>openHome();document.addEventListener("click",ev=>{const d=$("dayCheck");if(d.open&&!d.contains(ev.target))d.open=false;});$("resetEvents").onclick=()=>{for(const id of ["eventQuery","dateFrom","dateTo"])$(id).value="";$("sortKey").value="auto";$("sortOrder").value="asc";showOlderPast=false;renderEventList();};
$("restoreFile").addEventListener("change",()=>{const f=$("restoreFile").files[0];$("restoreFileName").textContent=f?f.name:"選択されていません";$("restoreFileName").classList.toggle("on",!!f);});

$("toggleFilter").onclick=()=>{const p=$("filterPanel");p.hidden=!p.hidden;$("toggleFilter").setAttribute("aria-expanded",String(!p.hidden));};document.addEventListener("click",ev=>{if(!ev.target.closest("#eventMenu,[data-menu]"))closeEventMenu();});document.addEventListener("keydown",ev=>{if(ev.key==="Escape")closeEventMenu();});window.addEventListener("resize",closeEventMenu);
$("filterToday").onclick=()=>{listTab="upcoming";$("dateFrom").value=$("dateTo").value=todayStr();renderEventList();};$("filterUpcoming").onclick=()=>{listTab="upcoming";$("dateFrom").value=todayStr();$("dateTo").value="";$("sortOrder").value="asc";renderEventList();};
for(const id of ["eventQuery","dateFrom","dateTo","sortKey","sortOrder"])$(id).addEventListener(id==="eventQuery"?"input":"change",renderEventList);
for(const id of ["crossPeriod","crossYear","crossCategory","crossStatus","crossQuery"])$(id).addEventListener(["crossYear","crossQuery"].includes(id)?"input":"change",renderCross);
$("crossPeriod").onchange=()=>{$("crossYear").disabled=$("crossPeriod").value==="all";renderCross();};
$("exportCross").onclick=()=>exportCross(false);$("exportCrossDetail").onclick=()=>exportCross(true);$("restoreBtn").onclick=restore;$("deleteAllData").onclick=openDeleteAllDialog;
$("saveSettings").onclick=saveSettings;$("saveSettingsNext").onclick=()=>{if(saveSettings()){prepTab="participants";render();}};
for(const c of document.querySelectorAll("[data-day-check]"))c.onchange=saveDayCheck;$("dayCheck").addEventListener("toggle",()=>{if($("dayCheck").open)$("dayCheck").dataset.userOpened="1";});$("soundTest").onclick=()=>{primeAudio();if(meta.sound===false){$("soundToggle").checked=true;meta.sound=true;saveMeta();}setTimeout(()=>feedback("success"),80);setTimeout(()=>feedback("warn"),1500);setTimeout(()=>feedback("error"),2700);};
$("soundVolume").value=meta.volume||"high";$("soundVolume").onchange=()=>{meta.volume=$("soundVolume").value;saveMeta();primeAudio();setTimeout(()=>feedback("success"),60);};$("addSession").onclick=()=>addSession();$("sessionEditor").addEventListener("input",renderSessionPresets);for(let i=1;i<=2;i++){$("customType"+i).onchange=()=>{toggleCustomOptions(i);renderCustomPreview();renderCustomPresets();};$("customLabel"+i).oninput=()=>{renderCustomPreview();renderCustomPresets();};$("customOptions"+i).oninput=renderCustomPreview;}for(const b of document.querySelectorAll("[data-clear-custom]"))b.onclick=()=>clearCustomPreset(Number(b.dataset.clearCustom));document.addEventListener("click",ev=>{for(const tip of document.querySelectorAll("#settingsPanel .es-help[open]"))if(!tip.contains(ev.target))tip.open=false;});document.addEventListener("click",ev=>{for(const tip of document.querySelectorAll(".dialog .ci-help[open]"))if(!tip.contains(ev.target))tip.open=false;});$("addPerson").onclick=()=>openPerson(null,false);
document.addEventListener("click",ev=>{
 for(const tip of document.querySelectorAll("#participantsPanel .pt-help[open]")){
  if(!tip.contains(ev.target))tip.open=false;
 }
});
$("personQuery").oninput=()=>setParticipantPage(1);
 $("personSessionFilter").onchange=()=>setParticipantPage(1);
 $("ptPageSize").onchange=()=>{participantPageSize=Number($("ptPageSize").value)||25;setParticipantPage(1);};
 $("ptPagePrev").onclick=()=>setParticipantPage(participantPage-1);
 $("ptPageNext").onclick=()=>setParticipantPage(participantPage+1);
 $("importParticipants").onclick=importParticipants;$("exportRoster").onclick=exportRoster;$("downloadTemplate").onclick=downloadTemplate;$("downloadTemplateXlsx").onclick=downloadTemplateXlsx;$("previewPaste").onclick=importFromPaste;for(const btn of document.querySelectorAll("[data-import-mode]"))btn.onclick=()=>setImportMode(btn.dataset.importMode);
$("qrPerson").onchange=renderOneQR;
 $("qrPrevious").onclick=()=>changeQRPerson(-1);$("qrNext").onclick=()=>changeQRPerson(1);
 for(const tab of document.querySelectorAll("[data-qr-mode]"))tab.onclick=()=>switchQrMode(tab.dataset.qrMode);
 $("downloadQR").onclick=downloadOneQR;$("printSingleQR").onclick=printSingleQR;$("printQRs").onclick=printQR;$("exportQRZip").onclick=exportQRZip;
$("exportResult").onclick=eventDetailCSV;$("exportAudit").onclick=exportAudit;$("printRosterPrep").onclick=()=>printReceptionRoster($("rosterSession").value);
document.addEventListener("click",ev=>{
 for(const help of document.querySelectorAll("#resultsPanel .out-export-help.is-open")){
  if(help.contains(ev.target))continue;
  help.classList.remove("is-open");help.querySelector(".out-info-trigger").setAttribute("aria-expanded","false");
 }
});$("printRosterDay").onclick=()=>printReceptionRoster(curSession()?.id);$("clearAttendance").onclick=openClearAttendanceDialog;$("checkinSession").onchange=()=>{showResult(null,"QRコードをかざしてください","");renderReception();};
$("cameraStart").onclick=startCamera;$("cameraSnapshot").onclick=saveCameraFrame;$("cameraStop").onclick=stopCamera;$("cameraSelect").onchange=async()=>{if(CAM.running){await stopCamera();}startCamera();};
if(window.ResizeObserver){const ro=new ResizeObserver(()=>fitReader());ro.observe($("readerViewport"));ro.observe($("reader"));}
$("mirrorToggle").checked=meta.mirror!==false;$("reader").classList.toggle("mirror",meta.mirror!==false);$("mirrorToggle").onchange=()=>{meta.mirror=$("mirrorToggle").checked;saveMeta();$("reader").classList.toggle("mirror",meta.mirror);};
$("soundToggle").checked=meta.sound!==false;$("soundToggle").onchange=()=>{meta.sound=$("soundToggle").checked;saveMeta();if(meta.sound){primeAudio();setTimeout(()=>feedback("success"),60);}};
document.addEventListener("pointerdown",primeAudio,{passive:true});document.addEventListener("keydown",primeAudio);
$("walkinBtn").onclick=()=>openPerson(null,true);$("manualBtn").onclick=openManual;$("closeDialog").onclick=closeDialog;
$("dialogBackdrop").addEventListener("click",e=>{if(e.target===$("dialogBackdrop"))closeDialog();});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("dialogBackdrop").hidden)closeDialog();});}
window.addEventListener("afterprint",()=>{document.body.removeAttribute("data-print-mode");$("receptionPrint").hidden=true;});
loadMeta();loadAll();delegate();render();
})();
