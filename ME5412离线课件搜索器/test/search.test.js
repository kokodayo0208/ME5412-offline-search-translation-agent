const test=require('node:test'),assert=require('node:assert/strict'),{tokenize,search}=require('../search');
test('中英文分词',()=>{let t=tokenize('Stroke rehabilitation 中风康复');assert(t.includes('stroke'));assert(t.includes('rehabilita'));assert(t.includes('中风'))});
test('BM25 找到对应页面',()=>{let d={files:[{path:'a.pdf',name:'stroke.pdf',kind:'PDF',pages:[{number:1,text:'stroke rehabilitation robotics'},{number:2,text:'wheelchair mobility'}]}]};assert.equal(search(d,'stroke rehabilitation')[0].page,1)});
