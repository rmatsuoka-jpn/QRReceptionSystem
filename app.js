/* QR受付システム: static offline browser app, v1 */
(()=>{"use strict";
const $=id=>document.getElementById(id), IX="QRReception:index:v1", PREFIX="QRReception:event:v1:";
const SCHEMA=1, db=new Map();let order=[],activeId=null,view="home",homeTab="events",prepTab="settings",day=false,qrRendered="",scannerStarted=false,lastScan="",lastScanAt=0,dialogReturnFocus=null,receptionTab="pending";
const esc=x=>String(x??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
const clone=x=>JSON.parse(JSON.stringify(x));
const catName=x=>({training:"研修",briefing:"説明会",other:"その他"}[x]||"その他");
const iso=()=>new Date().toISOString();
function localDate(s){if(!s)return "—";const t=new Date(s);return Number.isNaN(t.getTime())?"—":new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(t);}
function randomHex(n=12){if(!globalThis.crypto?.getRandomValues)throw Error("安全な乱数生成が利用できません。このブラウザを確認してください。");const b=new Uint8Array(n);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");}
function eventId(){let id;do{id="EVT-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+randomHex(4).toUpperCase();}while(db.has(id));return id;}
function sessionId(){return "S-"+randomHex(5);}
function token(id){return "QRRS1:"+id+":"+randomHex(16);}
function announce(msg,type=""){const n=$("notice");n.textContent=msg;n.className="notice "+type;n.hidden=!msg;}
function key(id){return PREFIX+id;}
function loadAll(){try{const index=JSON.parse(localStorage.getItem(IX)||'{"ids":[]}');if(!Array.isArray(index.ids))throw Error("イベント一覧の形式が正しくありません");order=[...new Set(index.ids.filter(x=>typeof x==="string"))];const missing=[];for(const id of order){try{const raw=localStorage.getItem(key(id));if(!raw){missing.push(id);continue;}const event=JSON.parse(raw);validateEvent(event);if(event.id!==id)throw Error("イベントIDが一致しません");db.set(id,event);}catch(err){missing.push(id);}}if(missing.length)announce("一部の保存データを読み込めませんでした："+missing.join("、")+"。既存データは自動削除していません。","error");}catch(err){announce("保存済みデータを読み込めません："+err.message+"。復元用JSONがある場合は保管してください。","error");}}
function validateEvent(e){if(!e||typeof e!=="object"||typeof e.id!=="string"||!/^EVT-[A-Za-z0-9-]+$/.test(e.id)||typeof e.name!=="string"||!e.name||!Array.isArray(e.sessions)||!e.sessions.length||!Array.isArray(e.participants)||!Number.isInteger(e.nextParticipant)||e.nextParticipant<1)throw Error("イベントの構造が正しくありません");const ss=new Set();for(const s of e.sessions){if(!s||typeof s.id!=="string"||typeof s.name!=="string"||!s.name||ss.has(s.id))throw Error("受付区分が不正です");ss.add(s.id);}const ids=new Set(),tokens=new Set();for(const p of e.participants){if(!p||typeof p.id!=="string"||typeof p.name!=="string"||!p.name||typeof p.token!=="string"||!p.planned||!p.checkins||ids.has(p.id)||tokens.has(p.token))throw Error("参加者情報が不正です");ids.add(p.id);tokens.add(p.token);}}
function writeEvent(e){validateEvent(e);try{localStorage.setItem(key(e.id),JSON.stringify(e));db.set(e.id,e);return true;}catch(err){announce("保存できませんでした。操作は確定していません："+err.message,"error");return false;}}
function writeIndex(ids){try{localStorage.setItem(IX,JSON.stringify({version:SCHEMA,ids}));order=ids;return true;}catch(err){announce("イベント一覧を保存できません："+err.message,"error");return false;}}
function mutate(fn){const old=db.get(activeId);if(!old)return false;const next=clone(old);try{fn(next)}catch(err){announce(err.message,"error");return false;}if(!writeEvent(next))return false;render();return true;}
function current(){return db.get(activeId);}
function curSession(){const e=current();return e?.sessions.find(s=>s.id===$("checkinSession").value)||e?.sessions[0];}
function checked(p,s){const c=p.checkins?.[s];return !!(c&&c.active!==false);}
function statusFor(e,p){const planned=e.sessions.filter(s=>p.planned[s.id]);const done=planned.filter(s=>checked(p,s.id));if(!planned.length)return "対象外";if(!done.length)return "未受付";return done.length===planned.length?"受付済み":"一部受付";}
function evCounts(e){let target=0,done=0;for(const p of e.participants.filter(p=>!p.removed)){for(const s of e.sessions){if(p.planned[s.id]){target++;if(checked(p,s.id))done++;}}}return {target,done,percent:target?Math.round(done/target*100):0};}
function makeEvent(from){const id=eventId(),sessions=from?from.sessions.map(s=>({id:sessionId(),name:s.name})):[{id:sessionId(),name:"全体"}];return {id,name:from?from.name+"（複製）":"新規イベント",date:"",category:from?.category||"training",sessions,customLabels:from?.customLabels?.slice(0,2)||["",""],customTypes:from?.customTypes?.slice(0,2)||["text","text"],customOptions:from?.customOptions?.map(opts=>opts.slice())||[[],[]],nextParticipant:1,participants:[],createdAt:iso()};}
function addEvent(fromId){let e;try{e=makeEvent(fromId?db.get(fromId):null);}catch(err){announce(err.message,"error");return;}const name=prompt("イベント名を入力",e.name);if(name===null)return;if(!name.trim())return announce("イベント名は必須です。","warn");e.name=name.trim();try{localStorage.setItem(key(e.id),JSON.stringify(e));if(!writeIndex([...order,e.id])){localStorage.removeItem(key(e.id));return;}db.set(e.id,e);openEvent(e.id,false,"settings");announce("イベントを作成しました。","success");}catch(err){try{localStorage.removeItem(key(e.id));}catch{}announce("イベントを保存できません："+err.message,"error");}}
function deleteEvent(id){const e=db.get(id);if(!e)return;if(!confirm("「"+e.name+"」を削除します。\n事前に全イベントJSONをバックアップしましたか？\n削除するとこのブラウザから名簿・受付履歴が消えます。"))return;if(!confirm("最終確認：イベント「"+e.name+"」を削除しますか？"))return;const next=order.filter(x=>x!==id);if(!writeIndex(next))return;try{localStorage.removeItem(key(id));db.delete(id);if(activeId===id){activeId=null;view="home";}render();announce("イベントを削除しました。","warn");}catch(err){writeIndex([...next,id]);announce("削除に失敗しました："+err.message,"error");}}
function openEvent(id,goDay=false,tab="settings"){if(!db.has(id))return;activeId=id;view="event";day=goDay;prepTab=tab;receptionTab="pending";render();}
function openHome(tab="events"){view="home";homeTab=tab;render();}
function summaryMetric(label,value){return '<div class="metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';}
function renderHome(){const ev=[...db.values()];$("globalSummary").innerHTML=summaryMetric("イベント",ev.length)+summaryMetric("参加登録（延べ）",ev.reduce((n,e)=>n+e.participants.filter(p=>!p.removed).length,0))+summaryMetric("受付済み（区分別）",ev.reduce((n,e)=>n+evCounts(e).done,0));
$("backupCount").textContent=ev.length+"イベントがバックアップ対象";
for(const name of ["events","cross","data"]){$("home"+name[0].toUpperCase()+name.slice(1)).hidden=name!==homeTab;document.querySelector('[data-home="'+name+'"]')?.classList.toggle("active",name===homeTab);}
if(homeTab==="events")renderEventList();if(homeTab==="cross")renderCross();}
function renderEventList(){const q=$("eventQuery").value.trim().toLocaleLowerCase("ja-JP"),from=$("dateFrom").value,to=$("dateTo").value,k=$("sortKey").value,sign=$("sortOrder").value==="asc"?1:-1,root=$("eventCards");root.replaceChildren();if(from&&to&&from>to){$("eventCount").textContent="開始日と終了日を確認してください。";return;}
const list=[...db.values()].filter(e=>(!q||e.name.toLocaleLowerCase("ja-JP").includes(q))&&(!from||(e.date&&e.date>=from))&&(!to||(e.date&&e.date<=to))).sort((a,b)=>{if(k==="date"){if(!a.date||!b.date)return !a.date&&!b.date?a.id.localeCompare(b.id):a.date?-1:1;return sign*a.date.localeCompare(b.date)||a.id.localeCompare(b.id);}return sign*a.id.localeCompare(b.id,"ja",{numeric:true});});
$("eventCount").textContent=list.length+" / "+db.size+"件を表示";
for(const e of list){const x=evCounts(e),card=document.createElement("article");card.className="event-card";card.innerHTML='<div><span class="date-pill">'+esc(e.date||"日付未設定")+'</span><span class="category-pill">'+esc(catName(e.category))+'</span><h3>'+esc(e.name)+'</h3><div class="code">'+esc(e.id)+'</div></div><div><div class="row status"><span>受付進捗</span><strong>'+x.done+" / "+x.target+'</strong></div><div class="progress"><div style="width:'+x.percent+'%"></div></div></div><div class="event-controls"><div class="status">'+e.participants.filter(p=>!p.removed).length+'名 登録　・　'+e.sessions.length+'区分</div><div class="buttons"><button class="btn small" data-action="prep" data-id="'+esc(e.id)+'">⚙ 準備</button><button class="btn main small" data-action="day" data-id="'+esc(e.id)+'">▣ 受付</button><button class="btn small" data-action="clone" data-id="'+esc(e.id)+'">⧉ 複製</button><button class="btn danger small" data-action="delete" data-id="'+esc(e.id)+'">削除</button></div></div>';root.append(card);}
if(!list.length){const p=document.createElement("div");p.className="panel";p.textContent="該当するイベントはありません。「＋ 新規イベント」から登録できます。";root.append(p);}}
function renderEvent(){const e=current();if(!e)return openHome();$("eventTitle").textContent=e.name;$("eventSubtitle").textContent=(e.date||"開催日未設定")+"　／　"+e.id+"　／　"+catName(e.category);$("prepView").hidden=day;$("receptionView").hidden=!day;for(const mode of ["prep","day"])document.querySelector('[data-mode="'+mode+'"]').classList.toggle("active",(mode==="day")===day);if(day){renderReception();return;}
for(const name of ["settings","participants","qr","results"]){$(name+"Panel").hidden=name!==prepTab;document.querySelector('[data-prep="'+name+'"]').classList.toggle("active",name===prepTab);}
if(prepTab==="settings")renderSettings();if(prepTab==="participants")renderParticipants();if(prepTab==="qr")renderQRSelect();if(prepTab==="results")renderResults();}
function getCustomType(e,i){return e.customTypes?.[i]||"text";}
function getCustomOptions(e,i){return e.customOptions?.[i]||[];}
function normalizeCustom(e,i,value){
 const v=String(value??"").trim(),type=getCustomType(e,i);
 if(!v)return "";
 if(type==="bool"){
  if(["有","あり","1","true","○","はい","yes"].includes(v.toLowerCase()))return "有";
  if(["無","なし","0","false","×","いいえ","no"].includes(v.toLowerCase()))return "無";
  throw Error((e.customLabels?.[i]||"任意項目"+(i+1))+" は「有」または「無」を選択してください");
 }
 if(type==="select"&&!getCustomOptions(e,i).includes(v))throw Error((e.customLabels?.[i]||"任意項目"+(i+1))+" の選択肢に「"+v+"」はありません");
 return v;
}
function toggleCustomOptions(i){$("customOptionsWrap"+i).hidden=$("customType"+i).value!=="select";}
function renderSettings(){
 const e=current();$("editEventName").value=e.name;$("editEventDate").value=e.date||"";$("editEventCategory").value=e.category;
 for(let i=0;i<2;i++){
  $("customLabel"+(i+1)).value=e.customLabels?.[i]||"";
  $("customType"+(i+1)).value=getCustomType(e,i);
  $("customOptions"+(i+1)).value=getCustomOptions(e,i).join("|");
  toggleCustomOptions(i+1);
 }
 const root=$("sessionEditor");root.replaceChildren();e.sessions.forEach((s,i)=>{const line=document.createElement("div");line.className="session-row";line.innerHTML='<span class="tag">'+(i+1)+'</span><input aria-label="受付区分名" class="search" value="'+esc(s.name)+'" data-session-name="'+esc(s.id)+'"><button class="btn danger small" data-action="remove-session" data-session="'+esc(s.id)+'">削除</button>';root.append(line);});
}
function saveSettings(){
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
 })){announce("イベント設定を保存しました。","success");}
}
function addSession(){const name=$("newSessionName").value.trim();if(!name)return announce("受付区分名を入力してください。","warn");const ok=mutate(e=>{if(e.sessions.some(s=>s.name===name))throw Error("同じ名前の受付区分があります");const id=sessionId();e.sessions.push({id,name});for(const p of e.participants){p.planned[id]=false;}});if(ok){$("newSessionName").value="";announce("受付区分を追加しました。","success");}}
function removeSession(id){const e=current(),s=e.sessions.find(x=>x.id===id);if(!s)return;if(e.sessions.length===1)return announce("受付区分は最低1つ必要です。","warn");if(e.participants.some(p=>p.checkins?.[id]))return announce("受付履歴がある区分は削除できません。","warn");if(!confirm("受付区分「"+s.name+"」を削除しますか？"))return;mutate(next=>{next.sessions=next.sessions.filter(x=>x.id!==id);for(const p of next.participants){delete p.planned[id];delete p.checkins[id];}});}
function renderParticipants(){const e=current(),q=$("personQuery").value.trim().toLowerCase();const people=e.participants.filter(p=>!p.removed&&[p.name,p.staffId,p.department,p.id].join(" ").toLowerCase().includes(q));$("peopleCount").textContent=people.length+"名";const tbody=$("participantRows");tbody.replaceChildren();for(const p of people){const tr=document.createElement("tr");const sessions=e.sessions.filter(s=>p.planned[s.id]).map(s=>s.name).join(" / ");tr.innerHTML="<td>"+esc(p.id)+"</td><td>"+esc(p.name)+"</td><td>"+esc(p.staffId||"—")+"</td><td>"+esc(p.department||"—")+'</td><td><span class="tag">'+esc(sessions||"対象外")+'</span></td><td><button class="btn small" data-action="edit-person" data-person="'+esc(p.id)+'">編集</button></td>';tbody.append(tr);}}
function newPerson(name,staffId,department,email,customValues,planned,source){const e=current();if(staffId&&e.participants.some(p=>!p.removed&&p.staffId===staffId))throw Error("同じ職員番号の参加者がすでに登録されています");const n=e.nextParticipant;return {id:String(n).padStart(4,"0"),name,staffId,department,email,customValues,token:token(e.id),planned,checkins:{},source,removed:false};}
function savePersonFromForm(andCheck){const id=$("personId")?.value||"",name=$("personName").value.trim(),staffId=$("personStaff").value.trim(),department=$("personDept").value.trim(),email=$("personEmail").value.trim();if(!name)return announce("氏名は必須です。","warn");const e=current(),planned=Object.fromEntries(e.sessions.map(s=>[s.id,!!$("planned-"+s.id)?.checked]));const values=[$("personCustom0")?.value||"",$("personCustom1")?.value||""];if(andCheck)planned[curSession().id]=true;let checkResult=null;const ok=mutate(next=>{if(staffId&&next.participants.some(p=>p.id!==id&&!p.removed&&p.staffId===staffId))throw Error("同じ職員番号の人が登録されています");let p=id?next.participants.find(p=>p.id===id):null;if(id&&!p)throw Error("参加者が見つかりません");if(!p){p={id:String(next.nextParticipant++).padStart(4,"0"),name,staffId,department,email,customValues:values,token:token(next.id),planned,checkins:{},source:day?"walkin":"pre",removed:false};next.participants.push(p);}else{for(const s of next.sessions)if(!planned[s.id]&&checked(p,s.id))throw Error("受付済みの区分は参加対象外にできません。受付取消後に変更してください。");Object.assign(p,{name,staffId,department,email,customValues:values,planned});}
 if(andCheck){const s=curSession(),prior=p.checkins[s.id];if(prior?.active!==false&&prior){checkResult={duplicate:true,person:p,when:prior.lastAt||prior.at};}else{const at=iso();if(prior){prior.active=true;prior.lastAt=at;prior.method="manual";(prior.history||(prior.history=[])).push({type:"recheck",at,method:"manual"});}else p.checkins[s.id]={at,lastAt:at,method:"manual",initialMethod:"manual",active:true,history:[]};checkResult={person:p,when:at};}}
 });if(!ok)return;closeDialog();if(andCheck){showResult(checkResult.person,checkResult.duplicate?"受付済み（重複）":"受付完了",checkResult.duplicate?"warn":"success",curSession()?.name,checkResult.when);announce("参加者情報を保存しました。","success");}else announce("参加者情報を保存しました。","success");}
function openPerson(id=null,dayMode=day){const e=current(),p=id?e.participants.find(x=>x.id===id):null;const session=curSession();const div=document.createElement("div");const planned=(s)=>p?p.planned[s.id]===true:(dayMode?s.id===session?.id:e.sessions.length===1);
div.innerHTML='<input type="hidden" id="personId" value="'+esc(p?.id||"")+'"><div class="fields two"><label class="field">氏名（必須）<input id="personName" value="'+esc(p?.name||"")+'"></label><label class="field">職員番号<input id="personStaff" value="'+esc(p?.staffId||"")+'"></label><label class="field">所属<input id="personDept" value="'+esc(p?.department||"")+'"></label><label class="field">メール<input id="personEmail" type="email" value="'+esc(p?.email||"")+'"></label><label class="field">'+esc(e.customLabels[0]||"任意項目1")+'<input id="personCustom0" value="'+esc(p?.customValues?.[0]||"")+'"></label><label class="field">'+esc(e.customLabels[1]||"任意項目2")+'<input id="personCustom1" value="'+esc(p?.customValues?.[1]||"")+'"></label></div><h3 style="margin-top:16px">参加予定</h3><div class="checkboxes">'+e.sessions.map(s=>'<label class="check"><input type="checkbox" id="planned-'+esc(s.id)+'" '+(planned(s)?"checked":"")+">"+esc(s.name)+"</label>").join("")+'</div><div id="personHistory"></div><div class="form-actions"><button class="btn main" id="savePersonDialog">保存</button>'+(dayMode?'<button class="btn soft" id="saveAndCheck">保存して受付</button>':"")+(p?'<button class="btn danger right" id="removePerson">参加者を除外</button>':"")+'</div>';
openDialog(p?"参加者の編集":"参加者を追加",div);$("savePersonDialog").onclick=()=>savePersonFromForm(false);if(dayMode)$("saveAndCheck").onclick=()=>savePersonFromForm(true);if(p){$("removePerson").onclick=()=>{if(!confirm("参加者を除外しますか？過去の受付履歴は保持します。"))return;if(mutate(next=>{next.participants.find(x=>x.id===id).removed=true;})){closeDialog();announce("参加者を除外しました。","warn");}};renderPersonHistory(p);}$("personName").focus();}
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
   btn.onclick=()=>{
    if(!confirm(p.name+" さんの「"+s.name+"」の受付を取り消しますか？"))return;
    const reason=prompt("取消理由を入力してください（例：誤受付）","誤受付");
    if(reason===null)return;
    const ok=mutate(next=>{
     const part=next.participants.find(x=>x.id===p.id),hist=part.checkins[s.id];
     hist.active=false;hist.canceledAt=iso();
     (hist.history||(hist.history=[])).push({type:"cancel",at:hist.canceledAt,reason:reason.trim().slice(0,200)});
    });
    if(ok){closeDialog();announce("受付取消を記録しました。","warn");}
   };
   card.append(btn);
  }
  root.append(card);
 }
}
function openManual(){const panel=document.createElement("div");panel.innerHTML='<input id="manualQuery" class="search" placeholder="氏名・職員番号・所属・参加者IDを検索" autofocus><div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>ID</th><th>氏名</th><th>所属</th><th>状況</th><th>受付</th></tr></thead><tbody id="manualRows"></tbody></table></div>';openDialog("名前から受付・変更",panel);$("manualQuery").addEventListener("input",renderManual);renderManual();$("manualQuery").focus();}
function renderManual(){const q=$("manualQuery").value.toLowerCase().trim(),e=current(),s=curSession(),tbody=$("manualRows");tbody.replaceChildren();for(const p of e.participants.filter(p=>!p.removed&&[p.name,p.staffId,p.department,p.id].join(" ").toLowerCase().includes(q)).slice(0,100)){const tr=document.createElement("tr");const td=document.createElement("td");td.innerHTML='<button class="btn small" data-manual-person="'+esc(p.id)+'">選択</button>';for(const v of [p.id,p.name,p.department||"—",checked(p,s.id)?"受付済み":p.planned[s.id]?"未受付":"対象外"]){const x=document.createElement("td");x.textContent=v;tr.append(x);}tr.append(td);tbody.append(tr);}}
function manualCheck(id){const e=current(),p=e.participants.find(x=>x.id===id),s=curSession();if(!p)return;if(checked(p,s.id))return openPerson(id,true);if(!p.planned[s.id]&&!confirm(p.name+" さんを「"+s.name+"」の参加対象にして受付しますか？"))return;const res=checkIn(id,"manual",true);if(res){closeDialog();}}
function checkInByToken(code){const e=current(),s=curSession(),p=e.participants.find(p=>p.token===code);if(!p){showResult(null,"名簿にないQRコードです","error");return;}checkIn(p.id,"qr",false);}
function checkIn(id,method,allowPlan){const e=current(),s=curSession();let result=null;const person=e.participants.find(p=>p.id===id);if(!person||person.removed){showResult(person,"受付できません","error");return false;}if(checked(person,s.id)){const c=person.checkins[s.id];showResult(person,"受付済み（重複）","warn",s.name,c.lastAt||c.at);return false;}if(!person.planned[s.id]&&!allowPlan){showResult(person,"この区分は参加対象外です","warn",s.name);return false;}
const ok=mutate(next=>{const p=next.participants.find(p=>p.id===id),at=iso();if(allowPlan)p.planned[s.id]=true;const c=p.checkins[s.id];if(c){c.active=true;c.lastAt=at;c.method=method;(c.history||(c.history=[])).push({type:"recheck",at,method});}else p.checkins[s.id]={at,lastAt:at,method,initialMethod:method,active:true,history:[]};result={person:p,at};});if(!ok){showResult(person,"保存に失敗しました","error");return false;}showResult(result.person,"受付完了","success",s.name,result.at);return true;}
function showResult(person,txt,level="warn",session="",at=""){const d=$("checkinResult");d.className="result "+level;d.replaceChildren();const head=document.createElement("div");head.className="outcome";head.textContent=txt;d.append(head);if(person){const name=document.createElement("div");name.className="person-name";name.textContent=person.name;d.append(name);const meta=document.createElement("div");meta.className="person-meta";meta.textContent=[person.department,session,at?localDate(at):""].filter(Boolean).join("　/　");d.append(meta);}}
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
 const pending=people.filter(p=>!checked(p,s.id)&&p.source!=="walkin").sort((a,b)=>a.name.localeCompare(b.name,"ja"));
 $("daySummary").innerHTML=summaryMetric("参加対象",people.length)+summaryMetric("受付済み",attended.length)+summaryMetric("未受付（事前登録）",pending.length);
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
  title.textContent=p.name;sub.textContent=p.department||"所属未登録";text.append(title,sub);
  const id=document.createElement("span");id.className="code";id.textContent="#"+p.id;
  row.append(text,id);waiting.append(row);
 }
 if(!attended.length)arrived.textContent="まだ受付済みの参加者はいません。";
 for(const p of attended){
  const row=document.createElement("div");row.className="pending-person";
  const text=document.createElement("div"),title=document.createElement("b"),sub=document.createElement("small"),detail=document.createElement("div");
  title.textContent=p.name;sub.textContent=p.department||"所属未登録";
  detail.className="attendance-detail";
  const method=document.createElement("span");method.className="attendance-method"+(p.source==="walkin"?" walkin":"");
  const record=p.checkins[s.id];
  method.textContent=p.source==="walkin"?"当日登録":record.method==="manual"?"手動受付":"QR受付";
  const clock=document.createElement("span");clock.className="checkin-time";
  clock.textContent=localDate(record.lastAt||record.at);
  detail.append(method,clock);text.append(title,sub,detail);
  const id=document.createElement("span");id.className="code";id.textContent="#"+p.id;
  row.append(text,id);arrived.append(row);
 }
 showReceptionTab(receptionTab);
 if(!scannerStarted)startScanner();
}
function startScanner(){scannerStarted=true;if(typeof Html5QrcodeScanner!=="function"){$("cameraHint").textContent="QR読み取りライブラリが見つかりません。vendor/を確認してください。";return;}try{const scanner=new Html5QrcodeScanner("reader",{fps:10,qrbox:{width:230,height:230},rememberLastUsedCamera:true},false);scanner.render(text=>{const code=String(text).trim(),now=Date.now();if(code===lastScan&&now-lastScanAt<1500)return;lastScan=code;lastScanAt=now;if(!day||view!=="event")return;checkInByToken(code);},()=>{});}catch(err){$("cameraHint").textContent="カメラを開始できません："+err.message;}}
function renderQRSelect(){const e=current(),sel=$("qrPerson"),old=sel.value;sel.replaceChildren();for(const p of e.participants.filter(p=>!p.removed))sel.add(new Option(p.id+" / "+p.name,p.id));if([...sel.options].some(x=>x.value===old))sel.value=old;if(!sel.options.length){$("qrCanvas").replaceChildren();$("qrPersonName").textContent="参加者を先に登録してください。";}else renderOneQR();}
function renderOneQR(){const p=current().participants.find(p=>p.id===$("qrPerson").value);if(!p)return;qrRendered=p.id;const root=$("qrCanvas");root.replaceChildren();$("qrPersonName").textContent=p.name+" / "+p.id;if(typeof QRCode!=="function")return announce("QRコード生成ライブラリがありません。","error");try{new QRCode(root,{text:p.token,width:192,height:192,correctLevel:QRCode.CorrectLevel.M});}catch(err){announce("QR生成に失敗しました："+err.message,"error");}}
function qrDataURL(root){const canvas=root.querySelector("canvas"),img=root.querySelector("img");if(canvas)return canvas.toDataURL("image/png");if(img?.src.startsWith("data:"))return img.src;return null;}
function downloadOneQR(){const data=qrDataURL($("qrCanvas"));if(!data)return announce("QR画像が準備できていません。","warn");downloadLink(data,"QR_"+activeId+"_"+qrRendered+".png");}
function printQR(){if(typeof QRCode!=="function")return announce("QRライブラリがありません。","error");const root=$("printSheets");root.replaceChildren();const e=current();let page=null,count=0;try{for(const p of e.participants.filter(p=>!p.removed)){if(count%10===0){page=document.createElement("div");page.className="print-page";root.append(page);}const card=document.createElement("div");card.className="print-card";const qr=document.createElement("div");new QRCode(qr,{text:p.token,width:136,height:136,correctLevel:QRCode.CorrectLevel.M});const data=qrDataURL(qr);if(!data)throw Error("QR画像の生成に失敗しました");const img=document.createElement("img");img.src=data;img.alt="受付用QR";const meta=document.createElement("span");const title=document.createElement("div");title.className="print-name";title.textContent=p.name;meta.append(title,document.createTextNode(p.id));card.append(img,meta);page.append(card);count++;}}catch(err){return announce("印刷用QRを生成できません："+err.message,"error");}if(!count)return announce("印刷対象者がいません。","warn");window.print();}
function csvCell(v){let x=String(v??"");if(/^[\s]*[=+\-@\t\r\n]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"';}
function csvDownload(rows,filename){const text="\uFEFF"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n")+"\r\n";downloadBlob(new Blob([text],{type:"text/csv;charset=utf-8"}),filename);}
function downloadLink(url,filename){const a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();}
function downloadBlob(blob,filename){const u=URL.createObjectURL(blob);downloadLink(u,filename);setTimeout(()=>URL.revokeObjectURL(u),3000);}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").slice(0,15);}
function fileSafe(s){return String(s).replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,40);}
function participantRows(e){return e.participants.filter(p=>!p.removed).map(p=>[e.id,e.name,e.date,e.category,p.id,p.staffId,p.name,p.department,p.email,p.customValues?.[0],p.customValues?.[1],...e.sessions.map(s=>p.planned[s.id]?"○":"×")]);}
function exportRoster(){const e=current();csvDownload([["event_id","event_name","event_date","category","participant_id","staff_id","氏名","所属","メール",e.customLabels[0]||"custom_1",e.customLabels[1]||"custom_2",...e.sessions.map(s=>s.name)],...participantRows(e)],"participants_"+fileSafe(e.id)+".csv");}
function exportEmails(){const e=current();csvDownload([["participant_id","name","email","qr_png_filename"],...e.participants.filter(p=>!p.removed).map(p=>[p.id,p.name,p.email||"","QR_"+e.id+"_"+p.id+".png"])],"QR_email_mapping_"+fileSafe(e.id)+".csv");announce("宛先CSVを出力しました。QR画像は個別発行からPNG保存してください。","warn");}

async function exportQRZip(){
 const button=$("exportQRZip"),e=current(),people=e.participants.filter(p=>!p.removed);
 if(!people.length)return announce("QR発行対象者がいません。","warn");
 if(typeof QRCode!=="function"||!globalThis.QRSupport)return announce("QR/ZIPライブラリがありません。配信ファイルを確認してください。","error");
 button.disabled=true;button.textContent="QRを生成中…";
 try{
  const files=[],csv=[["participant_id","name","department","email","qr_png_filename"]];
  const imgSize=192;
  for(let i=0;i<people.length;i++){
   const p=people[i],qr=document.createElement("div");
   new QRCode(qr,{text:p.token,width:imgSize,height:imgSize,correctLevel:QRCode.CorrectLevel.M});
   const png=qrDataURL(qr);
   if(!png)throw Error(p.name+" のQR画像を生成できません");
   const filename="QR_"+fileSafe(e.id)+"_"+p.id+".png";
   files.push({name:filename,content:globalThis.QRSupport.pngBytes(png)});
   csv.push([p.id,p.name,p.department||"",p.email||"",filename]);
   if((i+1)%20===0){button.textContent="生成中 "+(i+1)+"/"+people.length;await new Promise(resolve=>setTimeout(resolve,0));}
  }
  files.push({name:"recipient_mapping.csv",content:"\uFEFF"+csv.map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n"});
  files.push({name:"README.txt",content:"QR受付システム　QR配布用\nイベント: "+e.name+"\n開催日: "+e.date+"\n発行数: "+people.length+"\n\n画像ファイル名と宛先の対応はrecipient_mapping.csvを確認してください。\nQR画像には氏名等を直接埋め込まず、イベント専用の識別トークンを記録しています。\n"});
  const archive=globalThis.QRSupport.zip(files);
  downloadBlob(archive,"QR_reception_"+fileSafe(e.id)+"_"+stamp()+".zip");
  announce(people.length+"名分のQR画像と宛先CSVをZIPにまとめました。ダウンロード先を確認してください。","success");
 }catch(err){announce("QRの一括発行に失敗しました："+err.message,"error");}
 finally{button.disabled=false;button.textContent="⇩ QR一括ZIP";}
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

function detailHeader(){return ["event_id","event_name","event_date","category","session_id","session_name","participant_id","staff_id","name","department","custom_1_label","custom_1_value","custom_2_label","custom_2_value","planned","status","checked_in_at","last_checkin_at","method"];}
function detailRows(e,p){return e.sessions.map(s=>{const c=p.checkins[s.id],isChecked=checked(p,s.id);return [e.id,e.name,e.date,e.category,s.id,s.name,p.id,p.staffId,p.name,p.department,e.customLabels[0],p.customValues?.[0],e.customLabels[1],p.customValues?.[1],p.planned[s.id]?"1":"0",p.removed?"除外":isChecked?"受付済み":p.planned[s.id]?"未受付":"対象外",isChecked?localDate(c.at):"",isChecked?localDate(c.lastAt||c.at):"",isChecked?c.method:""];});}
function eventDetailCSV(){const e=current();csvDownload([detailHeader(),...e.participants.flatMap(p=>detailRows(e,p))],"event_result_"+fileSafe(e.id)+".csv");}
function renderResults(){const e=current();$("sessionStats").innerHTML=e.sessions.map(s=>{const eligible=e.participants.filter(p=>!p.removed&&p.planned[s.id]);return summaryMetric(s.name+"（受付 / 予定）",eligible.filter(p=>checked(p,s.id)).length+" / "+eligible.length);}).join("");}
function filteredCross(){const type=$("crossPeriod").value,year=+$("crossYear").value,cat=$("crossCategory").value,status=$("crossStatus").value,q=$("crossQuery").value.trim().toLowerCase();const records=[];for(const e of db.values()){if(cat!=="all"&&e.category!==cat)continue;if(type!=="all"){if(!Number.isInteger(year)||year<2000||year>2100||!e.date)continue;const a=type==="fiscal"?year+"-04-01":year+"-01-01",b=type==="fiscal"?(year+1)+"-04-01":(year+1)+"-01-01";if(e.date<a||e.date>=b)continue;}for(const p of e.participants.filter(p=>!p.removed)){const st=statusFor(e,p);if(status==="checked"&&st!=="受付済み"&&st!=="一部受付")continue;if(status==="partial"&&st!=="一部受付")continue;if(status==="pending"&&st!=="未受付")continue;if(q&&![e.name,e.id,p.id,p.name,p.staffId,p.department].join(" ").toLowerCase().includes(q))continue;records.push({e,p,status:st});}}return records.sort((a,b)=>b.e.date.localeCompare(a.e.date)||a.e.id.localeCompare(b.e.id)||a.p.id.localeCompare(b.p.id));}
function renderCross(){const records=filteredCross(),tbody=$("crossRows");tbody.replaceChildren();for(const {e,p,status} of records){const tr=document.createElement("tr");for(const x of [e.id,e.date,e.name,p.id,p.staffId,p.name,p.department,status]){const td=document.createElement("td");td.textContent=x||"—";tr.append(td);}tbody.append(tr);}$("crossCount").textContent=records.length+"件";const people=new Set(records.filter(({p})=>p.staffId).map(({p})=>p.staffId));$("crossSummary").innerHTML=summaryMetric("イベント",new Set(records.map(({e})=>e.id)).size)+summaryMetric("参加記録",records.length)+summaryMetric("職員番号あり・実人数",people.size);}
function exportCross(detail){const found=filteredCross();if(detail){csvDownload([detailHeader(),...found.flatMap(({e,p})=>detailRows(e,p))],"cross_sessions_"+stamp()+".csv");}else{const head=["event_id","event_name","event_date","category","participant_id","staff_id","name","department","planned_sessions","checked_sessions","status"];const rows=found.map(({e,p,status})=>[e.id,e.name,e.date,e.category,p.id,p.staffId,p.name,p.department,e.sessions.filter(s=>p.planned[s.id]).length,e.sessions.filter(s=>checked(p,s.id)).length,status]);csvDownload([head,...rows],"cross_participants_"+stamp()+".csv");}}
function backup(){const payload={schema_version:SCHEMA,exported_at:iso(),events:[...order].filter(x=>db.has(x)).map(x=>clone(db.get(x)))};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"}),"QRReception_backup_"+stamp()+".json");announce(payload.events.length+"件のJSONダウンロードを開始しました。ファイルが保存されたことを確認してください。","success");}

// Removes only the current application namespace. Do not touch browser-wide or legacy prototype data.
function deleteAllStoredData(){
 const entries=[];
 try{
  for(let i=0;i<localStorage.length;i++){
   const k=localStorage.key(i);
   if(k===IX||k?.startsWith(PREFIX))entries.push([k,localStorage.getItem(k)]);
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
 db.clear();order=[];activeId=null;view="home";homeTab="events";day=false;receptionTab="pending";
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
const previous=records.map(e=>[e.id,localStorage.getItem(key(e.id))]),newIds=[...order,...records.map(e=>e.id).filter(id=>!order.includes(id))];try{for(const e of records)localStorage.setItem(key(e.id),JSON.stringify(e));localStorage.setItem(IX,JSON.stringify({version:SCHEMA,ids:newIds}));for(const e of records)db.set(e.id,e);order=newIds;render();announce(records.length+"件を復元しました。","success");}catch(err){for(const [id,old] of previous){try{if(old===null)localStorage.removeItem(key(id));else localStorage.setItem(key(id),old);}catch{}}announce("復元に失敗しました。可能な限り元のデータに戻しました："+err.message,"error");}}
function csvParse(text){let i=0,inQuotes=false,field="",row=[],out=[];text=text.replace(/^\uFEFF/,"");while(i<text.length){const ch=text[i++];if(inQuotes){if(ch==='"'){if(text[i]==='"'){field+='"';i++;}else inQuotes=false;}else field+=ch;}else if(ch==='"'){inQuotes=true;}else if(ch===","){row.push(field);field="";}else if(ch==="\r"||ch==="\n"){if(ch==="\r"&&text[i]==="\n")i++;row.push(field);if(row.some(x=>x.trim()))out.push(row);field="";row=[];}else field+=ch;}if(inQuotes)throw Error("CSVの引用符が閉じられていません");if(field||row.length){row.push(field);if(row.some(x=>x.trim()))out.push(row);}return out;}

const CSV_FIELDS=[
 ["name","氏名（必須）",["氏名","name","名前"]],
 ["staffId","職員番号",["職員番号","staff_id"]],
 ["participantId","参加者ID（更新用）",["participant_id","参加者ID"]],
 ["eventId","イベントID（照合用）",["event_id","イベントID"]],
 ["department","所属",["所属","department"]],
 ["email","メール",["メール","メールアドレス","email"]],
 ["custom0","任意項目1",["custom_1"]],
 ["custom1","任意項目2",["custom_2"]]
];
let csvPending=null;
function csvMapping(){
 const obj={};
 for(const el of document.querySelectorAll("[data-csv-field]"))obj[el.dataset.csvField]=Number(el.value);
 return obj;
}
function mappedValue(row,m,key){const idx=m[key];return Number.isInteger(idx)&&idx>=0?String(row[idx]??"").trim():null;}
function prepareCsv(rows,m,mode,e){
 if(!Number.isInteger(m.name)||m.name<0)throw Error("氏名の列を指定してください");
 const fields=Object.entries(m).filter(([k,v])=>v>=0);
 const selected=new Set();for(const [field,index]of fields){if(selected.has(index))throw Error("同じCSV列を複数項目に割り当てられません（"+field+"）");selected.add(index);}
 const plans=[],seen=new Set();let invalid=0,skip=0,adds=0,updates=0,blank=0,nonTarget=0;
 for(let ri=1;ri<rows.length;ri++){
  const row=rows[ri],name=mappedValue(row,m,"name");
  if(!name){blank++;continue;}
  if(name.length>200)throw Error((ri+1)+"行目：氏名が長すぎます");
  const csvEvent=mappedValue(row,m,"eventId");
  if(csvEvent&&csvEvent!==e.id)throw Error((ri+1)+"行目：イベントIDが現在のイベントと異なります");
  const staff=mappedValue(row,m,"staffId"),pid=mappedValue(row,m,"participantId");
  const byPid=pid?e.participants.find(p=>p.id===pid):null;
  const byStaff=staff?e.participants.find(p=>p.staffId===staff):null;
  if(pid&&!byPid)throw Error((ri+1)+"行目：参加者ID "+pid+" はこのイベントにありません");
  if(byPid&&byStaff&&byPid.id!==byStaff.id)throw Error((ri+1)+"行目：参加者IDと職員番号の対応が不一致です");
  if(byPid&&staff&&byPid.staffId&&byPid.staffId!==staff)throw Error((ri+1)+"行目：登録済みの職員番号と一致しません");
  const exists=byPid||byStaff;
  if(exists?.removed)throw Error((ri+1)+"行目：除外済みの参加者は一括更新できません");
  const unique=exists?"id:"+exists.id:staff?"staff:"+staff:null;
  if(unique&&seen.has(unique)){skip++;continue;}
  if(unique)seen.add(unique);
  const values={name,staffId:staff,department:mappedValue(row,m,"department"),email:mappedValue(row,m,"email"),custom0:mappedValue(row,m,"custom0"),custom1:mappedValue(row,m,"custom1")};
  const planned={};
  for(const s of e.sessions){const v=mappedValue(row,m,"session:"+s.id);if(v!==null){try{planned[s.id]=globalThis.QRSupport.participation(v);}catch(err){throw Error((ri+1)+"行目「"+s.name+"」："+err.message);} }}
  if(exists){
   if(mode==="skip"){skip++;continue;}
   for(const s of e.sessions)if(planned[s.id]===false&&checked(exists,s.id))throw Error((ri+1)+"行目：受付済みの「"+s.name+"」を参加対象外にはできません");
   plans.push({kind:"update",id:exists.id,values,planned});updates++;
  }else{
   const plannedNew=Object.fromEntries(e.sessions.map(s=>[s.id,Object.hasOwn(planned,s.id)?planned[s.id]:(e.sessions.length===1&&!e.sessions.some(x=>m["session:"+x.id]>=0))]));
   if(!Object.values(plannedNew).some(Boolean))nonTarget++;
   plans.push({kind:"add",values,planned:plannedNew});adds++;
  }
 }
 return{plans,adds,updates,skip,blank,nonTarget};
}
function previewCsvImport(){
 if(!csvPending)return;
 const e=current(),mapping=csvMapping(),mode=$("csvConflictMode").value,root=$("csvPreview");
 try{
  const plan=prepareCsv(csvPending.rows,mapping,mode,e);
  root.innerHTML='<div class="summary">'+summaryMetric("新規",plan.adds)+summaryMetric("更新",plan.updates)+summaryMetric("スキップ",plan.skip)+'</div>'+
  '<div class="hint">氏名なし：'+plan.blank+'行'+(plan.nonTarget?'　／　参加区分なし：'+plan.nonTarget+'名（対象外で登録）':"")+'</div>';
  $("csvCommit").disabled=plan.plans.length===0;
  $("csvCommit").textContent=plan.adds+"名追加・"+plan.updates+"名更新する";
  return plan;
 }catch(err){
  root.replaceChildren();const notice=document.createElement("div");notice.className="notice error";notice.textContent=err.message;root.append(notice);
  $("csvCommit").disabled=true;return null;
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
    if(v.email!==null)p.email=v.email;
    if(!Array.isArray(p.customValues))p.customValues=["",""];
    if(v.custom0!==null)p.customValues[0]=v.custom0;
    if(v.custom1!==null)p.customValues[1]=v.custom1;
    Object.assign(p.planned,item.planned);
   }else{
    const v=item.values;
    e.participants.push({id:String(e.nextParticipant++).padStart(4,"0"),name:v.name,staffId:v.staffId||"",department:v.department||"",email:v.email||"",customValues:[v.custom0||"",v.custom1||""],token:token(e.id),planned:item.planned,checkins:{},source:"pre",removed:false});
   }
  }
 });
 if(ok){closeDialog();csvPending=null;$("participantFile").value="";announce("CSV登録完了：新規 "+plan.adds+"名、更新 "+plan.updates+"名、スキップ "+plan.skip+"名","success");}
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
 csvPending={rows,eventId:activeId};
 const e=current(),headers=rows[0].map(x=>String(x).trim());
 const fields=CSV_FIELDS.map(([id,label,aliases])=>[id,id==="custom0"?(e.customLabels[0]||"任意項目1"):id==="custom1"?(e.customLabels[1]||"任意項目2"):label,id==="custom0"?[e.customLabels[0],"custom_1"]:id==="custom1"?[e.customLabels[1],"custom_2"]:aliases]);
 for(const s of e.sessions)fields.push(["session:"+s.id,"参加予定："+s.name,[s.name,"参加_"+s.name,s.name+"_参加"]]);
 const root=document.createElement("div");
 const labels=document.createElement("div");labels.className="fields two";
 for(const [id,label,aliases]of fields){
  const wrap=document.createElement("label");wrap.className="field";wrap.textContent=label;
  const select=document.createElement("select");select.dataset.csvField=id;
  select.add(new Option("割り当てない","-1"));
  headers.forEach((h,i)=>select.add(new Option((i+1)+": "+h,String(i))));
  select.value=String(globalThis.QRSupport.detectColumn(headers,aliases.filter(Boolean)));
  select.addEventListener("change",previewCsvImport);
  wrap.append(select);labels.append(wrap);
 }
 const title=document.createElement("h3");title.textContent="CSV列の対応（"+(rows.length-1)+"行）";root.append(title,labels);
 const modeLabel=document.createElement("label");modeLabel.className="field";modeLabel.style.marginTop="18px";modeLabel.textContent="同じ職員番号・参加者IDがある場合";
 const mode=document.createElement("select");mode.id="csvConflictMode";mode.add(new Option("既存をスキップ","skip"));mode.add(new Option("既存の名簿情報を更新（QR・受付記録は維持）","update"));mode.value="skip";mode.onchange=previewCsvImport;modeLabel.append(mode);root.append(modeLabel);
 const sub=document.createElement("h3");sub.style.marginTop="18px";sub.textContent="取込プレビュー";root.append(sub);
 const sample=document.createElement("div");sample.className="tablewrap";
 const table=document.createElement("table");const thead=document.createElement("thead"),tr=document.createElement("tr");
 headers.slice(0,12).forEach(x=>{const th=document.createElement("th");th.textContent=x;tr.append(th);});thead.append(tr);table.append(thead);
 const tbody=document.createElement("tbody");
 rows.slice(1,6).forEach(row=>{const tr=document.createElement("tr");row.slice(0,12).forEach(x=>{const td=document.createElement("td");td.textContent=x;tr.append(td);});tbody.append(tr);});table.append(tbody);sample.append(table);root.append(sample);
 const preview=document.createElement("div");preview.id="csvPreview";preview.style.marginTop="16px";root.append(preview);
 const footer=document.createElement("div");footer.className="form-actions";
 const commit=document.createElement("button");commit.id="csvCommit";commit.className="btn main";commit.type="button";commit.textContent="登録する";commit.onclick=commitCsvImport;
 const cancel=document.createElement("button");cancel.className="btn";cancel.textContent="キャンセル";cancel.onclick=()=>{csvPending=null;closeDialog();};
 footer.append(commit,cancel);root.append(footer);
 openDialog("CSV取込・列の対応",root);previewCsvImport();
}
function openDialog(title,body){dialogReturnFocus=document.activeElement;$("dialogTitle").textContent=title;$("dialogBody").replaceChildren(body);$("dialogBackdrop").hidden=false;$("closeDialog").focus();}
function closeDialog(){$("dialogBackdrop").hidden=true;$("dialogBody").replaceChildren();dialogReturnFocus?.focus?.();}
function render(){const home=view==="home";$("homeView").hidden=!home;$("eventView").hidden=home;if(home)renderHome();else renderEvent();}
function delegate(){document.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
if(b.dataset.home){homeTab=b.dataset.home;render();return;}
if(b.dataset.mode){day=b.dataset.mode==="day";render();return;}
if(b.dataset.prep){prepTab=b.dataset.prep;render();return;}
if(b.dataset.backup!==undefined){backup();return;}
if(b.dataset.receptionTab){showReceptionTab(b.dataset.receptionTab);return;}
if(b.dataset.manualPerson){manualCheck(b.dataset.manualPerson);return;}
if(b.dataset.action){const id=b.dataset.id;switch(b.dataset.action){case "prep":return openEvent(id,false);case "day":return openEvent(id,true);case "clone":return addEvent(id);case "delete":return deleteEvent(id);case "edit-person":return openPerson(b.dataset.person,false);case "remove-session":return removeSession(b.dataset.session);}return;}
});
$("newEvent").onclick=()=>addEvent();$("backHome").onclick=()=>openHome();$("resetEvents").onclick=()=>{for(const id of ["eventQuery","dateFrom","dateTo"])$(id).value="";renderEventList();};
for(const id of ["eventQuery","dateFrom","dateTo","sortKey","sortOrder"])$(id).addEventListener(id==="eventQuery"?"input":"change",renderEventList);
for(const id of ["crossPeriod","crossYear","crossCategory","crossStatus","crossQuery"])$(id).addEventListener(["crossYear","crossQuery"].includes(id)?"input":"change",renderCross);
$("crossPeriod").onchange=()=>{$("crossYear").disabled=$("crossPeriod").value==="all";renderCross();};
$("exportCross").onclick=()=>exportCross(false);$("exportCrossDetail").onclick=()=>exportCross(true);$("restoreBtn").onclick=restore;$("deleteAllData").onclick=openDeleteAllDialog;
$("saveSettings").onclick=saveSettings;$("addSession").onclick=addSession;$("addPerson").onclick=()=>openPerson(null,false);
$("personQuery").oninput=renderParticipants;$("importParticipants").onclick=importParticipants;$("exportRoster").onclick=exportRoster;
$("qrPerson").onchange=renderOneQR;$("showQR").onclick=renderOneQR;$("downloadQR").onclick=downloadOneQR;$("printQRs").onclick=printQR;$("exportQRZip").onclick=exportQRZip;
$("exportResult").onclick=eventDetailCSV;$("exportAudit").onclick=exportAudit;$("checkinSession").onchange=()=>{showResult(null,"スキャン待機中","");renderReception();};
$("walkinBtn").onclick=()=>openPerson(null,true);$("manualBtn").onclick=openManual;$("closeDialog").onclick=closeDialog;
$("dialogBackdrop").addEventListener("click",e=>{if(e.target===$("dialogBackdrop"))closeDialog();});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("dialogBackdrop").hidden)closeDialog();});}
loadAll();delegate();render();
})();
