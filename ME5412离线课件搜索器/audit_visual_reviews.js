#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const index=JSON.parse(fs.readFileSync(path.join(__dirname,'index.json'),'utf8'));
const files=(index.files||[]).filter(f=>f.variant==='annotated'&&/^2\.[0-3]/.test(f.name));
const report=files.map(f=>({source:f.relativePath,pdfPages:f.pages.length,reviewedPages:f.pages.filter(p=>p.visualReviewStatus==='reviewed').length,reviewComplete:f.visualReview?.complete===true,annotationPages:f.pages.filter(p=>p.annotations?.length).length,reviewSourcePages:f.pages.filter(p=>p.visualReviewSource).length}));
const warnings=(index.warnings||[]).filter(w=>/visual review|review page|pageCount|reviewedPages/i.test(w));
process.stdout.write(JSON.stringify({indexVersion:index.version,files:report,warnings},null,2)+'\n');
if(files.length!==4||report.some(x=>!x.reviewComplete)||warnings.length)process.exitCode=1;
