/* Offline helpers: ZIP32 (stored/zero-compression) and CSV column mapping. No external requests. */
(function(root){"use strict";
const encoder=new TextEncoder();
function crc32(data){let crc=0xFFFFFFFF;for(const b of data){crc^=b;for(let j=0;j<8;j++)crc=crc&1?(crc>>>1)^0xEDB88320:crc>>>1;}return(crc^0xFFFFFFFF)>>>0;}
function u16(out,n){out.push(n&255,(n>>>8)&255);}
function u32(out,n){out.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);}
function zip(files){
 if(!Array.isArray(files)||!files.length)throw Error("ZIPに保存するファイルがありません。");
 const records=[],end=[],seen=new Set();
 let offset=0;
 const parts=[],time=new Date(),dosTime=(time.getHours()<<11)|(time.getMinutes()<<5)|(time.getSeconds()>>>1);
 const dosDate=((time.getFullYear()-1980)<<9)|((time.getMonth()+1)<<5)|time.getDate();
 for(const file of files){
  if(!file||typeof file.name!=="string"||file.name.includes("/")||file.name.includes("\\")||file.name==="."||file.name===".."||seen.has(file.name))throw Error("ZIP内のファイル名が重複または不正です");
  seen.add(file.name);
  const name=encoder.encode(file.name);
  const bytes=typeof file.content==="string"?encoder.encode(file.content):file.content;
  if(!(bytes instanceof Uint8Array))throw Error("ZIP内容が不正です");
  if(name.length>65535||bytes.length>0xFFFFFFFF)throw Error("ZIPに保存できるサイズを超えています");
  const crc=crc32(bytes),local=[];
  u32(local,0x04034b50);u16(local,20);u16(local,0x0800);u16(local,0);u16(local,dosTime);u16(local,dosDate);
  u32(local,crc);u32(local,bytes.length);u32(local,bytes.length);u16(local,name.length);u16(local,0);
  const localHeader=new Uint8Array([...local,...name]);parts.push(localHeader,bytes);
  const central=[];u32(central,0x02014b50);u16(central,20);u16(central,20);u16(central,0x0800);u16(central,0);
  u16(central,dosTime);u16(central,dosDate);u32(central,crc);u32(central,bytes.length);u32(central,bytes.length);
  u16(central,name.length);u16(central,0);u16(central,0);u16(central,0);u16(central,0);u32(central,0);u32(central,offset);
  end.push(new Uint8Array([...central,...name]));
  offset+=localHeader.length+bytes.length;
  if(offset>0xFFFFFFFF)throw Error("ZIP全体が大きすぎます。分割して出力してください。");
 }
 if(end.length>65535)throw Error("ZIP内のファイル数が多すぎます");
 const centralSize=end.reduce((n,b)=>n+b.length,0);if(centralSize>0xFFFFFFFF||offset+centralSize>0xFFFFFFFF)throw Error("ZIP全体が大きすぎます");
 const footer=[];u32(footer,0x06054b50);u16(footer,0);u16(footer,0);u16(footer,end.length);u16(footer,end.length);
 u32(footer,centralSize);u32(footer,offset);u16(footer,0);
 return new Blob([...parts,...end,new Uint8Array(footer)],{type:"application/zip"});
}
function pngBytes(dataUrl){
 if(!/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(dataUrl||""))throw Error("QRコードのPNG画像を読み取れません");
 const binary=atob(dataUrl.slice(dataUrl.indexOf(",")+1)),array=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)array[i]=binary.charCodeAt(i);
 return array;
}
function detectColumn(headers,aliases){const lower=headers.map(h=>String(h).trim().toLowerCase());for(const alias of aliases.filter(Boolean)){const index=lower.indexOf(String(alias).trim().toLowerCase());if(index>=0)return index;}return -1;}
function parseCSV(text){let i=0,quoted=false,field="",row=[],out=[];text=text.replace(/^\uFEFF/,"");while(i<text.length){const ch=text[i++];if(quoted){if(ch==='"'){if(text[i]==='"'){field+='"';i++;}else quoted=false;}else field+=ch;}else if(ch==='"'){quoted=true;}else if(ch===","){row.push(field);field="";}else if(ch==="\r"||ch==="\n"){if(ch==="\r"&&text[i]==="\n")i++;row.push(field);if(row.some(x=>x.trim()))out.push(row);field="";row=[];}else field+=ch;}if(quoted)throw Error("CSVの引用符が閉じられていません");if(field||row.length){row.push(field);if(row.some(x=>x.trim()))out.push(row);}return out;}
function parseTSV(text){
 let i=0,quoted=false,field="",row=[],out=[];
 text=String(text).replace(/^\uFEFF/,"");
 while(i<text.length){
  const ch=text[i++];
  if(quoted){
   if(ch==='"'){if(text[i]==='"'){field+='"';i++;}else quoted=false;}
   else field+=ch;
  }else if(ch==='"'){quoted=true;}
  else if(ch==="\t"){row.push(field);field="";}
  else if(ch==="\r"||ch==="\n"){
   if(ch==="\r"&&text[i]==="\n")i++;
   row.push(field);if(row.some(x=>x.trim()))out.push(row);
   field="";row=[];
  }else field+=ch;
 }
 if(quoted)throw Error("貼り付け内容の引用符が閉じられていません");
 if(field||row.length){row.push(field);if(row.some(x=>x.trim()))out.push(row);}
 return out;
}
function decodeCSV(buffer){
 const arr=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
 if(arr[0]===0xFF&&arr[1]===0xFE)return new TextDecoder("utf-16le").decode(arr);
 const utf=new TextDecoder("utf-8").decode(arr);
 if(!utf.includes("\uFFFD"))return utf;
 try{const sj=new TextDecoder("shift_jis").decode(arr);if((sj.match(/\uFFFD/g)||[]).length<(utf.match(/\uFFFD/g)||[]).length)return sj;}catch{}
 return utf;
}
const yes=/^(○|〇|◯|1|true|はい|有|参加|対象|yes)$/i;
const no=/^(×|✕|0|false|いいえ|無|不参加|対象外|no|)$/i;
function participation(value){const v=String(value??"").trim();if(yes.test(v))return true;if(no.test(v))return false;throw Error("参加予定は○／×、1／0などで入力してください（値："+v.slice(0,30)+"）");}
root.QRSupport={zip,pngBytes,detectColumn,parseCSV,parseTSV,decodeCSV,participation,crc32};
})(globalThis);
