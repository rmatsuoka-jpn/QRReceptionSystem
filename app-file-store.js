/* ローカルHTML用・保存先フォルダ管理。外部通信は行わない。 */
(function(g) {
  "use strict";
  const DB_NAME="QRReception:FileStore:v1", STORE="settings", KEY="exportFolder";
  let folder=null;
  const available=()=>!!(g.isSecureContext && typeof g.showDirectoryPicker==="function" && g.indexedDB);

  function openDb(){
    return new Promise((resolve,reject)=>{
      const r=indexedDB.open(DB_NAME,1);
      r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};
      r.onsuccess=()=>resolve(r.result);
      r.onerror=()=>reject(r.error||Error("保存先設定を開けません"));
    });
  }
  async function dbAction(type,fn){
    const db=await openDb();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,type),request=fn(tx.objectStore(STORE));
        let value;
        request.onsuccess=()=>{value=request.result;};
        request.onerror=()=>reject(request.error||Error("保存先設定を更新できません"));
        tx.oncomplete=()=>resolve(value);
        tx.onerror=()=>reject(tx.error||Error("保存先設定の処理に失敗しました"));
        tx.onabort=()=>reject(tx.error||Error("保存先設定を保存できません"));
      });
    }finally{db.close();}
  }
  function status(){return {available:available(),configured:!!folder,name:folder?.name||""};}
  async function init(){
    if(!available())return status();
    try{const saved=await dbAction("readonly",s=>s.get(KEY));if(saved?.kind==="directory")folder=saved;}
    catch(err){return {...status(),error:err.message};}
    return status();
  }
  async function choose(){
    if(!available())throw Error("この環境では保存先フォルダの直接指定を使用できません。");
    // showDirectoryPickerはユーザーのクリックから直接呼ぶ。
    const chosen=await g.showDirectoryPicker({id:"qr-reception-folder",mode:"readwrite"});
    await dbAction("readwrite",s=>s.put(chosen,KEY));
    folder=chosen;
    return status();
  }
  async function clear(){
    if(available())await dbAction("readwrite",s=>s.delete(KEY));
    folder=null;return status();
  }
  async function permission(mode="readwrite",ask=false){
    if(!folder)return "unconfigured";
    let state="prompt";
    if(typeof folder.queryPermission==="function"){
      try{state=await folder.queryPermission({mode});}catch{}
    }
    if(state!=="granted" && ask && typeof folder.requestPermission==="function"){
      state=await folder.requestPermission({mode});
    }
    return state;
  }
  async function requirePermission(mode,ask){
    const result=await permission(mode,ask);
    if(result!=="granted")throw Error("保存先フォルダへのアクセスが許可されていません。データ管理で権限を確認してください。");
  }
  async function uniqueFile(dir,filename){
    const dot=filename.lastIndexOf("."),root=dot>0?filename.slice(0,dot):filename,ext=dot>0?filename.slice(dot):"";
    for(let i=0;i<1000;i++){
      const candidate=i?root+"_"+(i+1)+ext:filename;
      try{await dir.getFileHandle(candidate);}
      catch(err){
        if(err?.name==="NotFoundError")return dir.getFileHandle(candidate,{create:true});
        throw err;
      }
    }
    throw Error("同名ファイルが多すぎます");
  }
  async function save(blob,filename,category=""){
    if(!folder)return {saved:false};
    await requirePermission("readwrite",true);
    const dir=category?await folder.getDirectoryHandle(category,{create:true}):folder;
    const handle=await uniqueFile(dir,filename),stream=await handle.createWritable();
    try{await stream.write(blob);await stream.close();}
    catch(err){try{await stream.abort();}catch{}throw err;}
    return {saved:true,name:handle.name,folder:dir.name};
  }
  async function list(category="受付実績",limit=1500){
    if(!folder)throw Error("データ管理で保存先を設定してください。");
    await requirePermission("read",true);
    let dir;
    try{dir=await folder.getDirectoryHandle(category);}
    catch(err){if(err?.name==="NotFoundError")return [];throw err;}
    const files=[];
    for await(const [name,handle] of dir.entries()){
      if(handle.kind!=="file"||!name.toLowerCase().endsWith(".json"))continue;
      if(files.length>=limit)throw Error("受付実績が多すぎます。古いファイルを整理してください。");
      const file=await handle.getFile();
      files.push(file);
    }
    return files;
  }
  g.QRFileStore={status,init,choose,clear,permission,save,list};
})(window);
