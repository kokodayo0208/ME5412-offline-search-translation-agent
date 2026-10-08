'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {selectPassages}=require('./search');

test('finds decisive UTF-8 course evidence beyond the first 850 lines',()=>{
  const filler=Array.from({length:900},(_,i)=>`讲义第${i}行：一般背景。\n`).join('');
  const decisive='课程补充：Direct selection requires reliable target choice.\nAn enlarged keyboard supports inaccurate finger placement.\n';
  const page=filler+decisive+'后续章节。\n';
  const excerpt=selectPassages(page,'Direct selection enlarged keyboard inaccurate finger placement',500);
  assert.ok(page.indexOf(decisive)>2600);
  assert.ok(excerpt.includes('An enlarged keyboard supports inaccurate finger placement.'));
  assert.ok(excerpt.length<=500);
});

test('keeps a negative premise beside the relevant statement',()=>{
  const page='Unrelated background.\n'.repeat(100)+'The user cannot reliably press individual keys.\nScanning uses a single reliable switch signal.\n';
  const excerpt=selectPassages(page,'scanning reliable switch signal',240);
  assert.ok(excerpt.includes('cannot reliably press individual keys'));
  assert.ok(excerpt.includes('Scanning uses a single reliable switch signal'));
});

test('preserves original text and stays within the character budget',()=>{
  const page='甲：第一段。\n'+'unrelated.\n'.repeat(100)+'乙：参与限制 only when participation is blocked.\n';
  const excerpt=selectPassages(page,'参与限制 participation blocked',120);
  assert.ok(excerpt.includes('乙：参与限制 only when participation is blocked.'));
  assert.ok(excerpt.length<=120);
  assert.equal(selectPassages('短页。','anything',50),'短页。');
});
