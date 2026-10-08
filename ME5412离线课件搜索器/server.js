#!/usr/bin/env node
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),cp=require('child_process'),{search,selectPassages}=require('./search');
const HOST='127.0.0.1',PORT=Number(process.env.PORT||18765),QA_MODEL=process.env.QA_MODEL||'qwen3:8b',VISION_MODEL=process.env.VISION_MODEL||'qwen3-vl:4b-instruct',TRANSLATION_MODEL=process.env.TRANSLATION_MODEL||'qwen3:8b';
let data;try{data=JSON.parse(fs.readFileSync(path.join(__dirname,'index.json'),'utf8'))}catch{}
const notesRoot=path.resolve(data?.folder||'', '笔记版课件');
const isNotesFile=file=>{const filePath=path.resolve(String(file?.path||''));return !!data?.folder&&filePath.startsWith(notesRoot+path.sep)};
const notesData=data?{...data,files:(data.files||[]).filter(isNotesFile)}:null;
const page=fs.readFileSync(path.join(__dirname,'app.html'),'utf8').replace('</body>','<script>'+fs.readFileSync(path.join(__dirname,'ask-lifecycle.js'),'utf8')+'</script></body>');
function send(r,c,b,t='application/json; charset=utf-8'){if(r.destroyed||r.writableEnded)return;r.writeHead(c,{'Content-Type':t,'Content-Length':Buffer.byteLength(b)});r.end(b)}
function allowed(f){const p=path.resolve(f||'');return !!notesData&&p.startsWith(notesRoot+path.sep)}
function readJson(q,limit=18*1024*1024){return new Promise((ok,no)=>{let a=[],n=0;q.on('data',c=>{n+=c.length;if(n>limit){no(Error('请求内容过大'));q.destroy()}else a.push(c)});q.on('end',()=>{try{ok(JSON.parse(Buffer.concat(a).toString()||'{}'))}catch{no(Error('JSON格式错误'))}});q.on('error',no)})}
function ollama(payload,timeout=240000,signal){return new Promise((ok,no)=>{if(signal?.aborted)return no(Error('请求已取消'));const body=JSON.stringify(payload);let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(deadline);signal?.removeEventListener('abort',cancel);error?no(error):ok(value)};const q=http.request({host:'127.0.0.1',port:11434,path:'/api/chat',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{let a=[],size=0;r.on('data',c=>{size+=c.length;if(size>2*1024*1024)q.destroy(Error('模型响应过大'));else a.push(c)});r.on('end',()=>{try{const x=JSON.parse(Buffer.concat(a));r.statusCode>=400?finish(Error(x.error||'模型错误')):finish(null,x)}catch{finish(Error('模型响应无效'))}});r.on('error',finish)});const cancel=()=>q.destroy(Error('请求已取消'));const deadline=setTimeout(()=>q.destroy(Error('模型响应超时')),timeout);signal?.addEventListener('abort',cancel,{once:true});q.on('error',finish);q.end(body)})}
function aiReady(){return new Promise(ok=>http.get({host:'127.0.0.1',port:11434,path:'/api/tags',timeout:1500},r=>{let a=[];r.on('data',c=>a.push(c));r.on('end',()=>{try{const x=JSON.parse(Buffer.concat(a));ok((x.models||[]).some(m=>m.name===QA_MODEL||m.model===QA_MODEL))}catch{ok(false)}})}).on('error',()=>ok(false)))}
function aiLoaded(){return new Promise(ok=>http.get({host:'127.0.0.1',port:11434,path:'/api/ps',timeout:1500},r=>{let a=[];r.on('data',c=>a.push(c));r.on('end',()=>{try{const x=JSON.parse(Buffer.concat(a));ok((x.models||[]).some(m=>m.name===QA_MODEL||m.model===QA_MODEL))}catch{ok(false)}})}).on('error',()=>ok(false)))}
function translationReady(){return new Promise(ok=>http.get({host:'127.0.0.1',port:11434,path:'/api/tags',timeout:1500},r=>{let a=[];r.on('data',c=>a.push(c));r.on('end',()=>{try{const x=JSON.parse(Buffer.concat(a));ok((x.models||[]).some(m=>m.name===TRANSLATION_MODEL||m.model===TRANSLATION_MODEL))}catch{ok(false)}})}).on('error',()=>ok(false)))}
const TRANSLATION_CONTEXT_TOKENS=4096,TRANSLATION_OUTPUT_TOKENS=2048,TRANSLATION_CHUNK_TOKENS=1100,TRANSLATION_TIMEOUT_MS=120000;
function translationTokenEstimate(value){const text=String(value||'');const cjk=(text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)||[]).length;return Math.ceil(cjk+(text.length-cjk)/4)}
function compactText(x){return String(x||'').normalize('NFKC').toLowerCase().replace(/\b(ultrasonic|sonar)\b/g,'ultrasound').replace(/\b(imus?)\b/g,'imu').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function optionEvidence(option,pages){
  const wanted=compactText(option).split(' ').filter(Boolean), phrase=compactText(option), hits=[];
  for(const p of pages){
    const text=compactText(p.text); let direct=text.includes(phrase);
    if(!direct&&wanted.length){
      const words=text.split(' '), at=[];
      for(let i=0;i<words.length;i++)if(wanted.includes(words[i]))at.push(i);
      direct=wanted.every(w=>at.some(i=>Math.abs(i-(at[0]||i))<=8));
    }
    if(direct)hits.push({page:p.number,text:p.text.slice(0,1800)});
  }
  return {option,mentioned:hits.length>0,hits};
}
function buildMultiEvidence(stem,options){
  // Retrieval only: the stem establishes the subject domain before option terms
  // are used. This prevents an option-only phrase from selecting an unrelated
  // deck (for example force-sensor rehabilitation material).
  const stemRanked=search(notesData,stem,120);
  const files=new Map((notesData.files||[]).map(f=>[f.path,f]));
  // For a question about examples named on the smart-wheelchair sensor slides,
  // retrieve the titled slide list itself. Nearby wheelchair pages and sensor
  // pages from other course topics must not expand that closed course list.
  const namedSmartWheelchairSensorList=/\bsmart[-\s]+wheelchairs?\b[\s\S]{0,80}\bsensors?\b|\bsensors?\b[\s\S]{0,80}\bsmart[-\s]+wheelchairs?\b/i.test(String(stem||''));
  const domainScores=new Map;
  for(const s of stemRanked){
    if(!s?.path)continue;
    const v=domainScores.get(s.path)||{score:0,hits:0,best:0};
    v.score+=Number(s.score||0)/(1+v.hits*0.35);v.hits++;v.best=Math.max(v.best,Number(s.score||0));domainScores.set(s.path,v);
  }
  const domains=[...domainScores.entries()].sort((a,b)=>b[1].score-a[1].score||b[1].best-a[1].best).slice(0,3).map(([p,stats])=>({path:p,stats,file:files.get(p)})).filter(x=>x.file);
  const pages=[],seen=new Set;
  const add=(s)=>{
    if(!s||!s.path||s.page==null)return;
    const key=s.path+'#'+s.page;if(seen.has(key))return;
    seen.add(key);pages.push(s);
  };
  if(namedSmartWheelchairSensorList){
    for(const file of files.values()){
      const indexed=file.pages||[];
      for(let i=0;i<indexed.length;i++){
        // Anchor the actual visual title, then include its explicitly labelled
        // continuation. This avoids a prose mention of sensors on another page
        // being mistaken for the course's enumerated sensor list.
        if(/VISUAL SUPPLEMENT\s*-\s*Smart Wheelchair Sensors(?:,|\s*$)/i.test(String(indexed[i].text||''))){
          const current=indexed[i], next=indexed[i+1];
          add({path:file.path,name:file.name,kind:file.kind,page:current.number,text:current.text,score:1});
          if(next&&/VISUAL SUPPLEMENT\s*-\s*Smart Wheelchair Sensors continued/i.test(String(next.text||''))){
            add({path:file.path,name:file.name,kind:file.kind,page:next.number,text:next.text,score:1});
          }
        }
      }
    }
    if(pages.length>=2)return {pages,evidence:options.map(o=>optionEvidence(o,pages)),closedExplicitList:true};
  }
  const addNeighbourhood=(anchor,span=2)=>{
    const file=files.get(anchor?.path),indexed=file?.pages||[];
    const at=indexed.findIndex(p=>Number(p.number)===Number(anchor?.page));
    if(at<0){add(anchor);return}
    add({path:file.path,name:file.name,kind:file.kind,page:indexed[at].number,text:indexed[at].text,score:Number(anchor.score||0)});
    for(let d=1;d<=span;d++){
      for(const offset of [-d,d]){const p=indexed[at+offset];if(p)add({path:file.path,name:file.name,kind:file.kind,page:p.number,text:p.text,score:Number(anchor.score||0)-(Math.abs(offset)*0.001)});}
    }
  };
  const primary=domains[0];
  if(primary)for(const hit of stemRanked.filter(s=>s.path===primary.path).slice(0,6))addNeighbourhood(hit,2);
  const allowedPaths=new Set(primary?[primary.path]:[]);
  for(const option of options)for(const hit of search(notesData,stem+' '+option,12))if(allowedPaths.has(hit.path))add(hit);
  for(const hit of stemRanked)if(allowedPaths.has(hit.path))add(hit);
  return {pages:pages.slice(0,36),evidence:options.map(o=>optionEvidence(o,pages)),closedExplicitList:false};
}function splitTranslationText(input,maxTokens=TRANSLATION_CHUNK_TOKENS){const text=String(input||'').replace(/\r\n/g,'\n').trim();if(!text)return[];const max=Math.min(maxTokens,TRANSLATION_CONTEXT_TOKENS-TRANSLATION_OUTPUT_TOKENS-512);const paragraphs=text.split(/\n{2,}/);const chunks=[];let current='';const fits=value=>translationTokenEstimate(value)<=max;const append=part=>{if(!part)return;if(!current){current=part;return}const joined=current+'\n\n'+part;if(fits(joined))current=joined;else{chunks.push(current);current=part}};const splitOversized=part=>{const units=part.split(/(?<=[.!?。！？；;])(?=\s|$)|(?<=\n)/).filter(Boolean);for(const unit of units.length?units:[part]){if(fits(unit)){append(unit);continue}let piece='';for(const char of unit){if(!fits(piece+char)){if(piece)append(piece);piece=char}else piece+=char}if(piece)append(piece)}};for(const paragraph of paragraphs){if(fits(paragraph))append(paragraph);else splitOversized(paragraph)}if(current)chunks.push(current);return chunks}const server=http.createServer(async(q,r)=>{try{const u=new URL(q.url,'http://'+HOST+':'+PORT);
if(u.pathname==='/')return send(r,200,page,'text/html; charset=utf-8');
if(u.pathname==='/api/status')return send(r,200,JSON.stringify({ready:!!notesData,files:data?.files?.length||0,pages:(data?.files||[]).reduce((n,f)=>n+f.pages.length,0),notesFiles:notesData?.files?.length||0,notesPages:(notesData?.files||[]).reduce((n,f)=>n+f.pages.length,0),model:QA_MODEL}));
 if(u.pathname==='/api/ai-status')return send(r,200,JSON.stringify({ready:await aiLoaded(),available:await aiReady(),model:QA_MODEL}));
if(u.pathname==='/api/translation-status')return send(r,200,JSON.stringify({ready:await translationReady(),model:TRANSLATION_MODEL}));
if(q.method==='POST'&&u.pathname==='/api/translate'){
  const translationController=new AbortController();
  const translationDeadline=setTimeout(()=>translationController.abort(),TRANSLATION_TIMEOUT_MS);
  const cancelTranslation=()=>{if(!r.writableEnded)translationController.abort()};
  r.once('close',cancelTranslation);
  try{
    const b=await readJson(q,256*1024),text=String(b.text||'').trim(),source=String(b.sourceLang||'auto'),target=String(b.targetLang||'zh'),MAX_TRANSLATION_INPUT=60000;
    if(!text)return send(r,400,JSON.stringify({error:'翻译内容不能为空'}));
    if(!['auto','en','zh'].includes(source)||!['en','zh'].includes(target)||source===target)return send(r,400,JSON.stringify({error:'不支持的翻译语言方向'}));
    if(text.length>MAX_TRANSLATION_INPUT)return send(r,413,JSON.stringify({error:'文本过长，请分段翻译（单次最多60000个字符）',limit:MAX_TRANSLATION_INPUT}));
    if(!(await translationReady()))return send(r,503,JSON.stringify({error:'离线翻译模型未安装：请在 Ollama 中安装 '+TRANSLATION_MODEL+'，或设置环境变量 TRANSLATION_MODEL 使用已安装模型。',model:TRANSLATION_MODEL}));
    const targetName=target==='en'?'英文':'中文',sourceName=source==='auto'?'自动识别':source==='en'?'英文':'中文',chunks=splitTranslationText(text),translations=[];
    for(let i=0;i<chunks.length;i++){
      const prompt='你是离线翻译器。只翻译，不解释、不总结、不回答问题。将下面文本从'+sourceName+'翻译为'+targetName+'。保留题号、选项字母、专业术语、公式、换行和项目符号；不要添加前言、后记或“翻译如下”。只输出译文。\n\n'+chunks[i];
      try{
        const x=await ollama({model:TRANSLATION_MODEL,stream:false,think:false,keep_alive:'30m',options:{temperature:0,seed:5412,num_ctx:TRANSLATION_CONTEXT_TOKENS,num_predict:TRANSLATION_OUTPUT_TOKENS},messages:[{role:'user',content:prompt}]},TRANSLATION_TIMEOUT_MS,translationController.signal);
        const part=String(x.message?.content||'').trim();if(!part)throw Error('模型返回空结果');translations.push(part);
      }catch(e){
        const cancelled=translationController.signal.aborted||e.message==='请求已取消';
        return send(r,cancelled?499:504,JSON.stringify({error:cancelled?'翻译请求已取消，请重试':'翻译第'+(i+1)+'/'+chunks.length+'段失败：'+(e.message||'模型超时'),chunk:i+1,totalChunks:chunks.length,model:TRANSLATION_MODEL}));
      }
    }
    return send(r,200,JSON.stringify({translation:translations.join('\n\n'),model:TRANSLATION_MODEL,sourceLang:source,targetLang:target,chunks:chunks.length,limits:{numCtx:TRANSLATION_CONTEXT_TOKENS,numPredict:TRANSLATION_OUTPUT_TOKENS,chunkTokens:TRANSLATION_CHUNK_TOKENS}}));
  }finally{clearTimeout(translationDeadline);r.removeListener('close',cancelTranslation)}
}
if(u.pathname==='/api/search')return send(r,notesData?200:503,JSON.stringify(notesData?{results:search(notesData,u.searchParams.get('q'))}:{error:'请先建立索引'}));
if(u.pathname==='/api/file'){const f=u.searchParams.get('path');if(!allowed(f)||!fs.existsSync(f))return send(r,404,'not found','text/plain');r.writeHead(200,{'Content-Type':path.extname(f).toLowerCase()==='.pdf'?'application/pdf':'application/octet-stream'});return fs.createReadStream(f).pipe(r)}
if(q.method==='POST'&&u.pathname==='/api/ask'){const askController=new AbortController(),askDeadline=setTimeout(()=>askController.abort('timeout'),180000);r.once('close',()=>{clearTimeout(askDeadline);if(!r.writableEnded)askController.abort('client-disconnected')});const b=await readJson(q),question=String(b.question||'').trim();if(!question)return send(r,400,JSON.stringify({error:'问题不能为空'}));const lines=question.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const optionLabel=/^\s*([A-Z])(?:\s*[.\):、]\s*|\s+)/i;
const labeled=lines.map((x,i)=>({x,i,m:x.match(optionLabel)})).filter(x=>x.i>0&&x.m);
let stem,optionLines;
if(labeled.length>=2){
  const first=labeled[0].i;
  stem=lines.slice(0,first).join('\n').replace(/[,，]?\s*(多选题|多选|multiple choice)\s*$/i,'').trim();
  optionLines=[];
  for(let n=0;n<labeled.length;n++){
    const start=labeled[n].i, end=n+1<labeled.length?labeled[n+1].i:lines.length;
    optionLines.push(lines.slice(start,end).join(' ').trim());
  }
}else{
  stem=(lines[0]||question).replace(/[,，]?\s*(多选题|多选|multiple choice)\s*$/i,'').trim();
  optionLines=lines.slice(1).filter(x=>x.length<240);
}
const modelQuestion=optionLines.length>=2?stem+'\n'+optionLines.join('\n'):question;const icfCase=/\b(icf|icidh|impairment|activity limitation|participation restriction|parapleg|environmental factor|personal factor)\b/i.test(question);const interfaceCase=/\b(keyboard|typing|text entry|input method|interface|direct selection|indirect selection|scanning|switch|head movement|eye gaze|fine motor|motor accuracy|accurate|precise|inaccurate|hand control|alternative keyboard|enlarged keyboard)\b/i.test(question)||/\b(?:finger|hand)\s+(?:movement|control|accuracy|motor)\b/i.test(question);const fill=/(_{2,}|…{2,}|\.\s*\.\s*\.|fill\s+in|fill\s+the\s+blank|填空|空格|空缺)/i.test(question);const multi=/(多选题|多项选择|可多选|(?<!单)多选|选择所有|select all that apply|choose all correct|all correct answers|multiple answers|multiple choice|multiple-choice|more than one)/i.test(question);const explicitSingle=/(单选题|单选|single choice|single-choice)/i.test(question);const mcq=explicitSingle||/(choose|which of|select|选择|以下|\[[ xX]?\])/i.test(question)||(!fill&&optionLines.length>=2);const tf=!mcq&&!fill&&/(true\s*\/\s*false|\bT\s*\/\s*F\b|判断题|判断正误|是否正确|正确还是错误|true or false)/i.test(question);/* Course supplements are evidence for the model, not a hard-coded answer route. */let sources=[],evidenceText='',multiEvidence=[];if(multi){const me=buildMultiEvidence(stem,optionLines);multiEvidence=me.evidence;sources=me.pages.map(p=>({path:p.path,name:p.name||((notesData.files||[]).find(f=>f.path===p.path)||{}).name||'',kind:p.kind||'PDF',page:p.page??p.number,text:p.text,score:p.score||1}));evidenceText='';}else{const pool=[],seen=new Set;function add(items){for(const s of items){const key=s.path+'#'+s.page;if(!seen.has(key)){seen.add(key);pool.push(s)}}}if(icfCase)add(search(notesData,'WHO international classifications ICF impairment activity participation environmental factors accessibility elevator barrier facilitator',12));add(search(notesData,stem+' '+optionLines.join(' '),12));for(const option of optionLines)add(search(notesData,stem+' '+option,3));add(search(notesData,question+' course logic explanation reasoning',18));if(icfCase)add(search(notesData,'WHO international classifications ICF impairment activity participation environmental factors accessibility',8));if(interfaceCase){add(search(notesData,'ME5412 Assistive Technology Interfaces direct selection indirect selection scanning switch alternative keyboard enlarged targets fine motor accuracy input methods pages 7 16 17 18',8));add(search(notesData,'keyboard shield enlarged keyboard direct key press inaccurate fingers scanning switch indirect selection reliable switch head movement eye gaze',8))}add(search(notesData,stem+' '+optionLines.join(' ')+' course supplement',12));sources=pool.slice(0,12)}if(!sources.length)return send(r,200,JSON.stringify({answer:'课件中没有找到足够相关的内容。',sources:[]}));const contextItems=(icfCase
  ? sources.filter(s=>/WHO international classifications|DETAILED COURSE LOGIC|CONTRASTIVE ICF CASE LOGIC/i.test(String(s.text||''))).concat(sources)
  : sources).filter((s,i,a)=>a.findIndex(x=>x.path===s.path&&x.page===s.page)===i).slice(0,multi?12:4);
let contextUsed=0;
const contextParts=[];
for(const [i,s] of contextItems.entries()){
  const remaining=(multi?10000:5500)-contextUsed;
  if(remaining<=0)break;
  const raw=String(s.text||'');
  const limit=Math.min(icfCase?2600:(i===0?2200:1200),remaining);
  const text=selectPassages(raw,stem+' '+optionLines.join(' '),limit);
  contextUsed+=text.length;
  contextParts.push('[资料'+(i+1)+'：'+s.name+'，第'+s.page+'页/张]\n'+text);
}
const closedExplicitList=multi&&contextItems.length>=2&&contextItems.every(s=>/\bsmart[-\s]+wheelchairs?\s+sens(?:or|ors)\b/i.test(String(s.text||'')));
let context=contextParts.join('\n\n');let rules;if(fill)rules='Fill in the blank with the exact short answer, then evidence.';else if(tf)rules='Answer True or False first, then briefly explain.';else if(multi)rules='Select every and only option supported by the course material.';else if(mcq)rules='Compare every option with the course material and choose one.';else rules='Answer directly, then explain.';const promptHead='你是ME5412课程题目的离线答题模型。只依据题干、原始选项和所给课件资料作答。保留题干的肯定、否定、条件和限定词；不要把检索关键词当作答案。'+rules+' 用简体中文给出2至4句简洁依据，并引用相关资料页。\n\n题目和选项：\n'+modelQuestion+'\n\n课件材料：\n';const structuredSingle=mcq&&!multi&&optionLines.length>=2;const structuredMulti=multi&&optionLines.length>=2;
const icfStructuredInstruction=icfCase&&structuredSingle?'\n\nICF consistency protocol: before selecting an option, independently classify the literal stem on impairment, activity_limitation, and participation_restriction. Use only "有", "无", or "不确定" for each axis. Explicit inability to walk, climb stairs, transfer, dress, communicate, or otherwise perform a concrete task means activity_limitation is "有"; accessible surroundings or social participation do not erase that stated task limitation. Explicit independent completion of relevant daily tasks supports activity_limitation "无". Do not infer activity_limitation "无" merely because a building, transport, or assistive technology is accessible or lets the person reach a place: an environmental facilitator can support performance and participation but does not itself restore the capacity to walk, climb stairs, transfer, or perform another task. Participation_restriction is "有" only when the stem says or directly entails inability to take part in a social role/context; a barrier matters only when it actually prevents participation. Select only the option whose three claims match the three axes. For each axis also return a short Chinese icf_evidence statement quoting only the relevant literal facts from the stem. Return only valid JSON with selected_option_text (copy the complete original option exactly; its text alone identifies the answer), icf_axes object and icf_evidence object, each containing impairment, activity_limitation, participation_restriction, reason_cn in simplified Chinese, citations array, and confidence (高/中/低). Do not select more than one option.': '';
const structuredInstruction=structuredSingle?(icfStructuredInstruction||'\n\nThis is single choice. Return only valid JSON with selected_option_text (copy the complete original option exactly; its text alone identifies the answer), reason_cn in simplified Chinese, citations array, and confidence (高/中/低). Do not select more than one option.'):structuredMulti?'\n\nThis is multiple choice. Return only valid JSON with selected_option_indices (zero-based integer array), reason_cn in simplified Chinese, citations array, and confidence (高/中/低). Select every option supported by the course material and no unsupported option. Do not use keyword presence as proof.':' ';
const outputBudget=structuredSingle?768:structuredMulti?1536:1024;
const estimateTokens=text=>{const value=String(text||'');const cjk=(value.match(/[\u3400-\u9fff\uf900-\ufaff]/g)||[]).length;return Math.ceil(cjk+(value.length-cjk)/4)};
const fixedPrompt=promptHead+(multi?'\n课件检索提示（仅用于定位，不是答案表）：\n'+evidenceText:'')+structuredInstruction;
const contextBudget=Math.max(320,4096-outputBudget-384-estimateTokens(fixedPrompt));
if(estimateTokens(context)>contextBudget)context=context.slice(0,Math.max(800,Math.floor(context.length*contextBudget/estimateTokens(context))));
const reviewPrompt=promptHead+(multi?'\n课件检索提示（仅用于定位，不是答案表）：\n'+evidenceText:'')+context;
const request={model:QA_MODEL,stream:false,think:false,keep_alive:'30m',options:{temperature:0,seed:5412,num_ctx:4096,num_predict:outputBudget},messages:[{role:'user',content:reviewPrompt+structuredInstruction}]};
console.log('[ask] prompt_chars='+request.messages[0].content.length+' estimated_tokens='+estimateTokens(request.messages[0].content)+' output_budget='+outputBudget+' context_budget='+contextBudget);
// Use Ollama's simple JSON mode during recovery.  The earlier full JSON Schema
// constrained decoder can stall; local validation below still resolves a choice
// only when it maps uniquely to an original option.
if(structuredSingle||structuredMulti)request.format='json';let reviewed=await ollama(request,180000,askController.signal);console.log('[ask] completion prompt_eval_count='+(reviewed.prompt_eval_count??'n/a')+' eval_count='+(reviewed.eval_count??'n/a')+' total_duration='+(reviewed.total_duration??'n/a'));
// A small local model can occasionally give a sound written exclusion while
// retaining that option's JSON index. For a titled, closed course list, make
// it audit the index set against its own evidence before rendering an answer.
if(structuredMulti&&closedExplicitList){
  const first=String(reviewed.message?.content||'').trim();
  const repairPrompt='复核下面的多选 JSON。资料是一个课件标题页明确列举的封闭清单。逐项检查：每个 selected_option_indices 中的索引必须能在资料中逐字或同义找到；若原解释将某项排除，该项绝不能保留在索引中；不能因工程上可行、其他章节出现或功能相近而加入。仅返回替换后的有效 JSON，字段与原格式相同，reason_cn 用简体中文。\n\n题目与选项：\n'+modelQuestion+'\n\n第一次 JSON：\n'+first+'\n\n课件标题页材料：\n'+context;
  reviewed=await ollama({model:QA_MODEL,stream:false,think:false,keep_alive:'30m',options:{temperature:0,seed:5412,num_ctx:4096},format:request.format,messages:[{role:'user',content:repairPrompt}]},180000,askController.signal);
}
let answer=String(reviewed.message?.content||'').trim();
if(structuredSingle||structuredMulti){
  try{
    let parsed;
    try{parsed=JSON.parse(answer.trim())}catch(jsonError){
      // A malformed JSON wrapper should not discard an otherwise explicit
      // single-choice answer.  Accept only a model-supplied option label in a
      // conventional answer position; the label is still resolved locally.
      const plain=answer.replace(/^```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim();
      const textChoice=plain.match(/(?:最终选择|final selection|answer|答案)\s*[：:]\s*([A-Z])(?:[.)、:：-]|\b)/i)||plain.match(/^([A-Z])(?:[.)、:：-]|\b)/i);
      if(!structuredSingle||!textChoice)throw jsonError;
      parsed={selected_option_text:textChoice[1],reason_cn:plain.slice(0,1200)||'模型以文本格式返回选择。',citations:[],confidence:'中'};
    }
    let reason=String(parsed.reason_cn||'').trim();
    if(!reason)throw Error('模型没有返回中文解析');
    let citations=Array.isArray(parsed.citations)&&parsed.citations.length?('\n依据：'+parsed.citations.slice(0,3).map(String).join('；')):'';
    let confidence=['高','中','低'].includes(String(parsed.confidence))?String(parsed.confidence):'中';
    if(structuredSingle){
      const normalizeOption=s=>String(s||'').normalize('NFKC').replace(/[‐‑‒–—]/g,'-').replace(/\s*([.)、:：-])\s*/g,'$1').replace(/\s+/g,' ').trim();
      const optionText=s=>normalizeOption(s).replace(/^[A-Z][.)、:：-]/i,'').trim();
      const optionIdentity=result=>{
        const selectedText=normalizeOption(result.selected_option_text);
        if(!selectedText)return null;
        let matches=optionLines.map((line,i)=>normalizeOption(line)===selectedText?i:-1).filter(i=>i>=0);
        if(!matches.length){
          const text=optionText(selectedText);
          matches=optionLines.map((line,i)=>optionText(line)===text?i:-1).filter(i=>i>=0);
        }
        if(!matches.length&&/^[A-Z]$/i.test(selectedText)){
          matches=optionLines.map((line,i)=>normalizeOption(line).startsWith(selectedText.toUpperCase())?i:-1).filter(i=>i>=0);
        }
        return matches.length===1?matches[0]:null;
      };
      let idx=optionIdentity(parsed);
      if(idx===null){
        const repairPrompt=reviewPrompt+structuredInstruction+'\n\nThe previous selected_option_text did not uniquely match a complete original option. Re-evaluate the question and course evidence, including whether reason_cn supports the chosen option. Return one valid JSON object with an exact complete copy of the chosen original option text; keep all required fields. Previous JSON:\n'+answer;
        const repaired=await ollama({...request,messages:[{role:'user',content:repairPrompt}]},180000,askController.signal);
        parsed=JSON.parse(String(repaired.message?.content||'').trim());
        idx=optionIdentity(parsed);
        if(idx===null)throw Error('单选选项原文无法唯一匹配');
        reason=String(parsed.reason_cn||'').trim();
        if(!reason)throw Error('模型复核后没有返回中文解析');
        citations=Array.isArray(parsed.citations)&&parsed.citations.length?('\n依据：'+parsed.citations.slice(0,3).map(String).join('；')):'';
        confidence=['高','中','低'].includes(String(parsed.confidence))?String(parsed.confidence):'中';
      }
      if(icfCase){
        const axes=parsed.icf_axes||{};
        const validAxis=x=>['有','无','不确定'].includes(String(x));
        if(!validAxis(axes.impairment)||!validAxis(axes.activity_limitation)||!validAxis(axes.participation_restriction))throw Error('ICF三轴判断无效');
        const selected=optionLines[idx].toLowerCase();
        // An option may omit an axis (for example, it can state participation restriction
        // without restating an existing impairment).  Reject only an explicit contradiction,
        // while requiring an explicit "no" assertion when the model classified that axis as absent.
        const contradicts=(axis,noTerm)=>String(axes[axis])==='有'?selected.includes(noTerm):String(axes[axis])==='无'?!selected.includes(noTerm):false;
        let mismatch=contradicts('impairment','no impairment')||contradicts('activity_limitation','no limitation')||contradicts('participation_restriction','no restriction');
        if(mismatch){
          const retry=await ollama({...request,messages:[{role:'user',content:reviewPrompt+structuredInstruction+'\n\nYour prior assessment was internally inconsistent. Re-evaluate the literal stem from scratch. The selected option must not explicitly contradict any ICF axis, and an absent axis must be explicitly absent in the selected option. Return the required JSON only.'}]},180000,askController.signal);
          parsed=JSON.parse(String(retry.message?.content||'').trim());
          citations=Array.isArray(parsed.citations)&&parsed.citations.length?('\n依据：'+parsed.citations.slice(0,3).map(String).join('；')):'';
          confidence=['高','中','低'].includes(String(parsed.confidence))?String(parsed.confidence):'中';
          const retryIdx=optionIdentity(parsed),retryAxes=parsed.icf_axes||{};
          if(retryIdx===null||!validAxis(retryAxes.impairment)||!validAxis(retryAxes.activity_limitation)||!validAxis(retryAxes.participation_restriction))throw Error('ICF复核结果无效');
          idx=retryIdx;
          Object.assign(axes,retryAxes);
          const retrySelected=optionLines[idx].toLowerCase();
          const retryContradicts=(axis,noTerm)=>String(axes[axis])==='有'?retrySelected.includes(noTerm):String(axes[axis])==='无'?!retrySelected.includes(noTerm):false;
          mismatch=retryContradicts('impairment','no impairment')||retryContradicts('activity_limitation','no limitation')||retryContradicts('participation_restriction','no restriction');
          if(mismatch)throw Error('ICF复核后仍与三轴判断不一致');
        }
        const evidence=parsed.icf_evidence||{};
        const axisText=['impairment','activity_limitation','participation_restriction'].map(key=>String(evidence[key]||'').trim());
        if(axisText.some(x=>!x))throw Error('ICF三轴证据不完整');
        answer='最终选择：'+optionLines[idx]+'\n解析：ICF三轴判断——身体结构/功能损伤：'+axes.impairment+'（'+axisText[0]+'）；具体活动限制：'+axes.activity_limitation+'（'+axisText[1]+'）；社会参与限制：'+axes.participation_restriction+'（'+axisText[2]+'）。'+citations+'\n置信度：'+confidence;
      }else answer='最终选择：'+optionLines[idx]+'\n解析：'+reason+citations+'\n置信度：'+confidence;
    }else{
      const values=Array.isArray(parsed.selected_option_indices)?parsed.selected_option_indices:[];
      const indices=[...new Set(values.map(Number))].filter(Number.isInteger).filter(x=>x>=0&&x<optionLines.length).sort((a,b)=>a-b);
      if(!indices.length)throw Error('多选索引无效或为空');
      answer='最终选择：'+indices.map(x=>optionLines[x]).join('\n')+'\n解析：'+reason+citations+'\n置信度：'+confidence;
    }
  }catch(e){return send(r,502,JSON.stringify({error:'离线模型返回的结构化结果无效：'+e.message,model:QA_MODEL}))}
}if(!answer)return send(r,502,JSON.stringify({error:'离线模型返回空答案',model:QA_MODEL}));
return send(r,200,JSON.stringify({answer,sources,model:QA_MODEL+'（课件推理）',debug:{multi,stem,closedExplicitList}}))}
if(q.method==='POST'&&u.pathname==='/api/vision'){const b=await readJson(q),image=String(b.image||'').replace(/^data:image\/[^;]+;base64,/,'');if(!/^[A-Za-z0-9+/=\r\n]+$/.test(image)||image.length<20)return send(r,400,JSON.stringify({error:'图片无效'}));const x=await ollama({model:VISION_MODEL,stream:false,keep_alive:'30m',options:{temperature:.05,num_ctx:4096},messages:[{role:'user',content:String(b.prompt||'准确识别全部文字并解释图片内容。').slice(0,2000),images:[image]}]});return send(r,200,JSON.stringify({answer:x.message?.content||'',model:VISION_MODEL}))}
return send(r,404,'not found','text/plain')}catch(e){const timedOut=e.message==='模型响应超时'||e.message==='请求已取消';send(r,timedOut?504:500,JSON.stringify({error:timedOut?'本地模型处理超时或请求已取消，请重试':e.message||'服务器错误'}))}});
server.on('error',e=>{console.error(e.message);process.exitCode=1});
server.listen(PORT,HOST,()=>{const url='http://'+HOST+':'+PORT+'/';console.log('ME5412 Offline AI Search: '+url);if(process.argv.includes('--open')){const win=process.platform==='win32';try{cp.spawn(win?'cmd.exe':process.platform==='darwin'?'open':'xdg-open',win?['/d','/c','start','',url]:[url],{detached:true,stdio:'ignore'}).unref()}catch{}}});
