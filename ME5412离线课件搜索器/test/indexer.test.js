'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {build,annotationText}=require('../indexer');
test('annotated page review and PDF comments attach only to the exact relative path',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'me5412-index-'));
  try{
    const visual=path.join(root,'visual'),noted=path.join(root,'笔记版课件');fs.mkdirSync(visual);fs.mkdirSync(noted);
    const name='2.0 ME5412 Part 2 Introduction.pdf',original=path.join(root,name),annotated=path.join(noted,name);
    fs.writeFileSync(original,'original');fs.writeFileSync(annotated,'annotated');
    fs.writeFileSync(path.join(visual,'intro.json'),JSON.stringify({sourceRelativePath:'笔记版课件/'+name,sourceName:name,pageCount:2,reviewedPages:2,pages:[{number:1,visualReviewed:true,slideTextSummary:'intro',visualDescription:'robot categories',notes:['handwritten note'],interpretation:'scope',keywords:['rehabilitation'],uncertainties:[]},{number:2,visualReviewed:true,slideTextSummary:'market',visualDescription:'bar chart',notes:'margin note',interpretation:'trend',keywords:['growth'],uncertainties:''}]}));
    const data=await build(root,{visualDir:visual,supplementData:{[name]:{'1':'legacy original'}},pdfReader:async file=>[{number:1,slideText:'course slide',annotations:file===annotated?['PDF sticky comment']:[]},{number:2,slideText:'more slide',annotations:[]}]});
    const a=data.files.find(f=>f.variant==='annotated'),o=data.files.find(f=>f.variant==='original');
    assert.equal(data.warnings.length,0);assert.deepEqual(a.visualReview,{reviewedPages:2,pageCount:2,complete:true});
    assert.match(a.pages[0].text,/PDF ANNOTATIONS: PDF sticky comment/);assert.match(a.pages[0].text,/USER NOTES: handwritten note/);assert.match(a.pages[0].text,/INTERPRETATION: scope/);
    assert.doesNotMatch(o.pages[0].text,/handwritten note|robot categories/);assert.match(o.pages[0].text,/VISUAL SUPPLEMENT: legacy original/);
    assert.doesNotMatch(a.pages[0].text,/legacy original/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('incomplete and invalid review coverage is reported without marking complete',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'me5412-index-'));
  try{
    const visual=path.join(root,'visual'),noted=path.join(root,'笔记版课件');fs.mkdirSync(visual);fs.mkdirSync(noted);
    const name='2.1 ME5412 Stroke and Stroke Rehabilitation.pdf';fs.writeFileSync(path.join(noted,name),'pdf');
    fs.writeFileSync(path.join(visual,'stroke.json'),JSON.stringify({sourceRelativePath:'笔记版课件/'+name,pageCount:3,reviewedPages:3,pages:[{number:1,visualReviewed:true,visualDescription:'brain'},{number:1,visualReviewed:true,visualDescription:'duplicate'},{number:4,visualReviewed:true,visualDescription:'out of range'}]}));
    const data=await build(root,{visualDir:visual,pdfReader:async()=>[{number:1,slideText:'a'},{number:2,slideText:'b'}]});
    assert.equal(data.files[0].visualReview.complete,false);assert.equal(data.files[0].pages[1].visualReviewStatus,'missing');
    assert.ok(data.warnings.some(x=>x.includes('duplicate review page')));assert.ok(data.warnings.some(x=>x.includes('out-of-range review page')));assert.ok(data.warnings.some(x=>x.includes('missing review page 2')));
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('PDF annotation text preserves sticky-note content',()=>{
  assert.match(annotationText({contentsObj:{str:'handwriting note'},titleObj:{str:'Tutor'}}),/handwriting note/);
});
