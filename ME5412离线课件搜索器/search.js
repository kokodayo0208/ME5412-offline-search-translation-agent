'use strict';
const STOP=new Set('a an and are as at be by for from how in is it of on or the to was were what when which with will would can could should this that these those'.split(' '));
const norm=x=>String(x||'').normalize('NFKC').toLowerCase();
function stem(w){if(w.length>5&&w.endsWith('ies'))return w.slice(0,-3)+'y';for(const s of ['tion','ment','ness','ingly','edly','ing','ed','es','s'])if(w.length>s.length+3&&w.endsWith(s))return w.slice(0,-s.length);return w}
function tokenize(s){s=norm(s);const a=(s.match(/[a-z][a-z0-9_+\-]*/g)||[]).map(stem).filter(x=>!STOP.has(x));for(const r of s.match(/[\u3400-\u9fff]+/g)||[]){a.push(...r);for(let i=0;i<r.length-1;i++)a.push(r.slice(i,i+2))}return a}
function search(data,q,limit=100){const qt=tokenize(q),Q=new Map,docs=[],df=new Map;for(const t of qt)Q.set(t,(Q.get(t)||0)+1);if(!Q.size)return[];for(const f of data.files||[])for(const p of f.pages||[]){let T=new Map;for(const t of tokenize(p.text))T.set(t,(T.get(t)||0)+1);for(const t of T.keys())df.set(t,(df.get(t)||0)+1);docs.push({f,p,T,len:[...T.values()].reduce((a,b)=>a+b,0)||1})}const n=docs.length,plain=norm(q);return docs.map(d=>{let score=0,matched=[];for(const[t,qf]of Q){let tf=d.T.get(t)||0;if(!tf)continue;score+=(tf*2.2/(tf+1.2*(.25+.75*d.len/100)))*(Math.log((n+1)/((df.get(t)||0)+1))+1)*qf;matched.push(t)}if(plain.length>2&&norm(d.p.text).includes(plain))score+=5;if(matched.some(t=>norm(d.f.name).includes(t)))score+=1.5;return score&&{path:d.f.path,name:d.f.name,kind:d.f.kind,page:d.p.number,text:d.p.text,score,matched}}).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,limit)}
// Select source excerpts across the entire page. Keep neighbouring text so that
// qualifications (including negation) stay attached to the matching sentence.
function selectPassages(pageText,query,maxChars=2600){
  const source=String(pageText||''),budget=Math.max(0,Math.floor(Number(maxChars)||0));
  if(!budget)return '';
  if(source.length<=budget)return source;
  const terms=[...new Set(tokenize(query))];
  if(!terms.length)return source.slice(0,budget);
  const pieces=[];
  for(const line of source.split(/(?<=\n)/)){
    if(line.length<=500){pieces.push(line);continue}
    const sentences=line.match(/[^.!?。！？；;\n]+[.!?。！？；;]?\s*|\n/g)||[line];
    for(const sentence of sentences){
      for(let i=0;i<sentence.length;i+=500)pieces.push(sentence.slice(i,i+500));
    }
  }
  const offsets=[];let pos=0;
  for(const piece of pieces){offsets.push(pos);pos+=piece.length}
  const candidates=[];
  for(let i=0;i<pieces.length;i++){
    const start=Math.max(0,i-1),end=Math.min(pieces.length,i+2);
    const excerpt=source.slice(offsets[start],offsets[end]??source.length);
    const matched=new Set(tokenize(pieces[i]));
    let score=0;
    for(const term of terms)if(matched.has(term))score++;
    if(!score)continue;
    score=score*score/Math.sqrt(Math.max(1,excerpt.length));
    // A short heading is useful context, but cannot win without a query match.
    if(/^\s*(?:#{1,4}\s*|\d+(?:\.\d+)*[.)]?\s+|[A-Z][A-Z\s-]{5,}:?\s*$)/m.test(pieces[i]))score*=1.15;
    candidates.push({start:offsets[start],end:offsets[end]??source.length,score});
  }
  candidates.sort((a,b)=>b.score-a.score||a.start-b.start);
  const chosen=[];let used=0;
  for(const candidate of candidates){
    if(chosen.some(x=>candidate.start<x.end&&candidate.end>x.start))continue;
    const length=candidate.end-candidate.start;
    if(length>budget-used)continue;
    chosen.push(candidate);used+=length;
    if(used>=budget)break;
  }
  if(!chosen.length)return source.slice(0,budget);
  chosen.sort((a,b)=>a.start-b.start);
  const separator='\n[…]\n';
  let result='';
  for(const part of chosen){
    const excerpt=source.slice(part.start,part.end);
    if(result.length+excerpt.length+(result?separator.length:0)>budget)continue;
    result+=(result?separator:'')+excerpt;
  }
  return result||source.slice(0,budget);
}
module.exports={norm,tokenize,search,selectPassages};
