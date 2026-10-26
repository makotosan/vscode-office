const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const JSZip=require('jszip');
const {XMLSerializer}=require('@xmldom/xmldom');
const {xml,nodes,W}=require('./inspect.cjs');
const {hash}=require('./input.cjs');
const execute=promisify(execFile);
async function generate(input) {
 const executable=process.env.PANDOC_BIN||'pandoc';
 if(input.imageMode==='linked'&&input.assets.some(a=>a.mime==='image/svg+xml'))throw new Error('UNSUPPORTED: Pandoc linked SVG awaits #4 acceptance');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'docx-pandoc-poc-'));
 try {
  const options={windowsHide:true,timeout:60000,maxBuffer:16*1024*1024};
  const version=(await execute(executable,['--version'],options)).stdout.split(/\r?\n/)[0];
  const defaultReference=await execute(executable,['--print-default-data-file=reference.docx'],{...options,encoding:'buffer'});
  const reference=await JSZip.loadAsync(defaultReference.stdout),doc=xml(await reference.file('word/document.xml').async('string'));
  const sizes=nodes(doc,W,'pgSz');
  if(!sizes.length) {
   const sections=nodes(doc,W,'sectPr');if(!sections.length)throw new Error('Pandoc reference has no section');
   for(const section of sections){const size=doc.createElementNS(W,'w:pgSz');section.appendChild(size);sizes.push(size);}
  }
  for(const size of sizes){size.setAttributeNS(W,'w:w',String(input.page.widthTwips));size.setAttributeNS(W,'w:h',String(input.page.heightTwips));}
  reference.file('word/document.xml',new XMLSerializer().serializeToString(doc));
  const referenceBytes=await reference.generateAsync({type:'nodebuffer'});
  await fs.writeFile(path.join(dir,'reference.docx'),referenceBytes);
  await fs.writeFile(path.join(dir,'input.html'),input.html);
  const args=['--from=html','--to=docx','--standalone','--reference-doc=reference.docx','--output=output.docx','input.html'];
  const result=await execute(executable,args,{...options,cwd:dir});
  const bytes=await fs.readFile(path.join(dir,'output.docx'));
  const zip=await JSZip.loadAsync(bytes),media=await Promise.all(Object.entries(zip.files).filter(([n,e])=>!e.dir&&n.startsWith('word/media/')).map(async([,e])=>hash(await e.async('nodebuffer'))));
  const diagnostics=[];
  for(const a of input.assets)if(!media.includes(a.sha256))diagnostics.push({code:'image-byte-retention',severity:'error',message:`Original image bytes not retained: ${a.id} (${a.mime})`});
  if(result.stderr.trim())diagnostics.push({code:'pandoc-stderr',severity:'warning',message:result.stderr.trim()});
  return {bytes,diagnostics,metadata:{version,arguments:args,referenceSha256:hash(referenceBytes),referenceChange:'A4 page size only'},
   ...(input.imageMode==='linked'?{postprocess:raw=>require('./docxjs.cjs').linkImages(raw,input),postprocessName:'explicit-id-image-links'}:{})};
 } finally {await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={generate};
