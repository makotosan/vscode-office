const {parse}=require('node-html-parser');
const d=require('docx');
const JSZip=require('jszip');
const {XMLSerializer}=require('@xmldom/xmldom');
const {xml,nodes,W,R,REL}=require('./inspect.cjs');

function modelFromHtml(input) {
 const root=parse(input.html),diagnostics=[];
 const warn=(code,message)=>diagnostics.push({code,message,severity:'error'});
 function style(e) {
  const result={};
  for(const item of (e.getAttribute('style')||'').split(';')) { const at=item.indexOf(':');if(at>0)result[item.slice(0,at).trim()]=item.slice(at+1).trim(); }
  const supported=new Set(['text-align','width','background-color','border','font-weight','font-style','color','page-break-after','display']);
  for(const key of Object.keys(result))if(!supported.has(key))warn('css',`Unsupported inline CSS ${key} on ${e.tagName}`);
  return result;
 }
 function runs(node, inherited={}) {
  if(node.nodeType===3)return [{text:node.text,...inherited}];
  const tag=node.tagName?.toLowerCase();
  if(tag==='img')return [{assetId:node.getAttribute('data-poc-asset-id')}];
  if(tag==='br')return [{text:'\n',...inherited}];
  const s=style(node),next={...inherited};
  if(['strong','b','th'].includes(tag)||s['font-weight']==='bold')next.bold=true;
  if(['em','i'].includes(tag)||s['font-style']==='italic')next.italic=true;
  if(s.color) {if(/^#[a-f\d]{6}$/i.test(s.color))next.color=s.color.slice(1);else warn('color',`Unsupported color ${s.color}`);}
  if(tag==='a')warn('element','Hyperlink model is not implemented');
  return node.childNodes.flatMap(n=>runs(n,next));
 }
 function blocks(parent) {
  const result=[];
  for(const e of parent.childNodes) {
   if(e.nodeType===3) {if(e.text.trim())result.push({type:'paragraph',runs:[{text:e.text}]});continue;}
   const tag=e.tagName?.toLowerCase(),s=style(e);
   if(['style','script','head'].includes(tag))continue;
   if(e.classList?.contains('page-break')||s['page-break-after']==='always'){result.push({type:'pageBreak'});continue;}
   if(tag==='table') {
    if(s.width)warn('table-width','Explicit table CSS width is not implemented by this minimal model');
    const rows=e.querySelectorAll('tr').filter(r=>r.closest('table')===e).map(row=>({cells:row.childNodes.filter(c=>['TD','TH'].includes(c.tagName)).map(cell=>{
     const cs=style(cell),colSpan=Number(cell.getAttribute('colspan')||1),rowSpan=Number(cell.getAttribute('rowspan')||1);
     if(cs.border && cs.border!=='1px solid #222')warn('border','Only the fixture 1px solid #222 border is mapped');
     if(!Number.isInteger(colSpan)||colSpan<1||!Number.isInteger(rowSpan)||rowSpan<1)throw new Error('Invalid table span');
     return {colSpan,rowSpan,widthTwips:cs.width&&/^\d+(?:\.\d+)?px$/.test(cs.width)?Math.round(parseFloat(cs.width)*15):undefined,
      background:cs['background-color']?.replace('#',''),blocks:[{type:'paragraph',runs:runs(cell)}]};
    })}));
    result.push({type:'table',rows});
   } else if(['ul','ol'].includes(tag)) result.push({type:'list',ordered:tag==='ol',items:e.childNodes.filter(c=>c.tagName==='LI').map(c=>[{type:'paragraph',runs:runs(c)}])});
   else if(['p','h1','h2','h3','h4','h5','h6'].includes(tag))result.push({type:tag==='p'?'paragraph':'heading',level:Number(tag[1]),runs:runs(e),align:s['text-align']});
   else if(['html','body','div','section'].includes(tag))result.push(...blocks(e));
   else if(tag==='img')result.push({type:'paragraph',runs:runs(e)});
   else {warn('element',`Unsupported block ${tag}`);result.push({type:'paragraph',runs:runs(e)});}
  }
  return result;
 }
 return {blocks:blocks(root.querySelector('body')||root),diagnostics};
}
async function linkImages(bytes,input) {
 const zip=await JSZip.loadAsync(bytes),doc=xml(await zip.file('word/document.xml').async('string')),
  rel=xml(await zip.file('word/_rels/document.xml.rels').async('string')),serializer=new XMLSerializer();
 const WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',A='http://schemas.openxmlformats.org/drawingml/2006/main';
 const seen=new Set();
 for(const drawing of nodes(doc,W,'drawing')) {
  const properties=[...nodes(drawing,WP,'docPr'),...nodes(drawing,'http://schemas.openxmlformats.org/drawingml/2006/picture','cNvPr')];
  const ids=[...new Set(properties.map(p=>p.getAttribute('descr')).filter(s=>s?.startsWith('poc-asset:')).map(s=>s.slice(10)))];
  const id=ids.length===1?ids[0]:undefined;
  const asset=input.assets.find(a=>a.id===id),blip=nodes(drawing,A,'blip')[0];
  if(!asset||!blip||seen.has(id))throw new Error('Ambiguous image occurrence; refusing linked conversion');
  seen.add(id);
  const relationship=rel.createElementNS(REL,'Relationship'),rid=`pocLink${seen.size}`;
  if(nodes(rel,REL,'Relationship').some(r=>r.getAttribute('Id')===rid))throw new Error('Image relationship ID collision');
  relationship.setAttribute('Id',rid);relationship.setAttribute('Type',R+'/image');relationship.setAttribute('TargetMode','External');
  relationship.setAttribute('Target',`assets/${asset.id}.${asset.mime==='image/jpeg'?'jpg':'png'}`);rel.documentElement.appendChild(relationship);
  blip.removeAttributeNS(R,'embed');blip.setAttributeNS(R,'r:link',rid);
 }
 if(seen.size!==input.assets.length)throw new Error('Missing image occurrence');
 // Embedded parts are intentionally retained as diagnostic evidence, not claimed cleaned.
 zip.file('word/document.xml',serializer.serializeToString(doc));zip.file('word/_rels/document.xml.rels',serializer.serializeToString(rel));
 return zip.generateAsync({type:'nodebuffer'});
}
async function generate(input) {
 if(input.assets.some(a=>a.mime==='image/svg+xml'))throw new Error('UNSUPPORTED: docx.js SVG API requires a raster fallback; SVG is preserved and no implicit PNG fallback is generated');
 const model=modelFromHtml(input),assets=new Map(input.assets.map(a=>[a.id,a]));
 const border={style:d.BorderStyle.SINGLE,size:6,color:'222222'};
 const run=r=>r.assetId?new d.ImageRun({type:assets.get(r.assetId).mime==='image/jpeg'?'jpg':'png',data:assets.get(r.assetId).bytes,
  transformation:{width:assets.get(r.assetId).widthPx,height:assets.get(r.assetId).heightPx},altText:{name:r.assetId,description:`poc-asset:${r.assetId}`,title:r.assetId}}):new d.TextRun({text:r.text,bold:r.bold,italics:r.italic,color:r.color});
 function blocks(items) {return items.flatMap(b=>{
  if(b.type==='pageBreak')return new d.Paragraph({children:[new d.PageBreak()]});
  if(b.type==='list')return b.items.flatMap(item=>item.map((p)=>new d.Paragraph({children:p.runs.map(run),...(b.ordered?{numbering:{reference:'poc-numbered',level:0}}:{bullet:{level:0}})})));
  if(b.type==='table')return new d.Table({width:{size:100,type:d.WidthType.PERCENTAGE},rows:b.rows.map(row=>new d.TableRow({children:row.cells.map(cell=>new d.TableCell({
   children:blocks(cell.blocks),columnSpan:cell.colSpan,rowSpan:cell.rowSpan,
   ...(cell.widthTwips?{width:{size:cell.widthTwips,type:d.WidthType.DXA}}:{}),
   ...(cell.background?{shading:{fill:cell.background}}:{}),borders:{top:border,bottom:border,left:border,right:border}}))}))});
  return new d.Paragraph({children:b.runs.map(run),...(b.type==='heading'?{heading:d.HeadingLevel[`HEADING_${b.level}`]}:{}),...(b.align?{alignment:b.align}:{})});
 });}
 const doc=new d.Document({creator:'vscode-office PoC',compatibilityModeVersion:15,
  styles:{default:{document:{run:{font:'Arial',size:22}}}},
  numbering:{config:[{reference:'poc-numbered',levels:[{level:0,format:d.LevelFormat.DECIMAL,text:'%1.',alignment:d.AlignmentType.LEFT}]}]},
  sections:[{properties:{page:{size:{width:input.page.widthTwips,height:input.page.heightTwips}}},children:blocks(model.blocks)}]});
 const bytes=await d.Packer.toBuffer(doc);
 return {bytes,diagnostics:model.diagnostics,model,...(input.imageMode==='linked'?{postprocess:raw=>linkImages(raw,input),postprocessName:'explicit-id-image-links'}:{})};
}
module.exports={generate,modelFromHtml,linkImages};
