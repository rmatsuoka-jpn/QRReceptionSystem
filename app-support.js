/* Offline helpers for participant import: CSV/TSV parsing, character-encoding detection and column mapping.
   No external requests. ZIP and Excel (.xlsx) files are created with the bundled JSZip library (vendor/jszip.min.js). */
(function(root){"use strict";
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
root.QRSupport={detectColumn,parseCSV,parseTSV,decodeCSV,participation};
})(globalThis);
