const test=require('node:test'),assert=require('node:assert/strict');const {tokenize,search}=require('../search');
test('tokenize English and Chinese ngrams',()=>{const t=tokenize('stroke rehabilitation 中风康复');assert(t.includes('stroke'));assert(t.includes('rehabilita'));assert(t.includes('中风'))});
test('BM25 ranks matching page first',()=>{const d={files:[{path:'a.pdf',name:'a.pdf',kind:'PDF',pages:[{number:1,text:'stroke rehabilitation robotics'},{number:2,text:'wheelchair'}]}]};const r=search(d,'stroke rehabilitation');assert.equal(r[0].page,1);assert(r[0].score>0)});
