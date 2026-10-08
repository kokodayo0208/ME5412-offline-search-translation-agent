"""Local-only PDF/PPTX extractor."""
import html,json,re,sys,zipfile
from pathlib import Path
try: import fitz
except ImportError as e: raise SystemExit('PyMuPDF (fitz) is required for PDF extraction') from e
EXTS={'.pdf','.pptx'}
def clean(s):
 s=html.unescape(s or '');s=re.sub(r'[\t\r\f\v]+',' ',s);s=re.sub(r'\n{3,}','\n\n',s);return re.sub(r' {2,}',' ',s).strip()[:120000]
def pdf(p):
 with fitz.open(p) as d:return [{'number':i+1,'text':clean(x.get_text('text'))} for i,x in enumerate(d)]
def pptx(p):
 with zipfile.ZipFile(p) as z:
  ns=[n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)];ns.sort(key=lambda n:int(re.search(r'slide(\d+)',n).group(1)));out=[]
  for i,n in enumerate(ns,1):
   raw=z.read(n).decode('utf-8','ignore');pieces=re.findall(r'<a:t(?:\s[^>]*)?>(.*?)</a:t>',raw,re.S);out.append({'number':i,'text':clean('\n'.join(re.sub(r'<[^>]+>','',x) for x in pieces))})
  return out
def main(root):
 files=[];warnings=[]
 for p in sorted(Path(root).rglob('*'),key=lambda x:str(x).lower()):
  if not p.is_file() or p.suffix.lower() not in EXTS:continue
  try:
   pages=pdf(p) if p.suffix.lower()=='.pdf' else pptx(p);st=p.stat();files.append({'path':str(p.resolve()),'name':p.name,'kind':p.suffix[1:].upper(),'size':st.st_size,'mtimeMs':st.st_mtime_ns//1000000,'pages':pages})
  except Exception as e:warnings.append(f'{p.name}: {e}')
 print(json.dumps({'folder':str(Path(root).resolve()),'files':files,'warnings':warnings},ensure_ascii=False))
if __name__=='__main__':main(sys.argv[1] if len(sys.argv)>1 else '.')
