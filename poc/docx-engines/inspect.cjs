const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const path = require('node:path').posix;
const { hash } = require('./input.cjs');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const nodes = (doc, ns, name) => Array.from(doc.getElementsByTagNameNS(ns, name));
const children = n => Array.from(n.childNodes).filter(n => n.nodeType === 1);
function xml(text) { if (/<!DOCTYPE/i.test(text)) throw new Error('DTD prohibited'); return new DOMParser({onError:(_,m)=>{throw new Error(m);}}).parseFromString(text,'application/xml'); }
async function inspect(bytes) {
  const errors = [], docs = new Map(), media = [], rels = new Map();
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes, {checkCRC32:true});
    for (const [name,e] of Object.entries(zip.files)) if (!e.dir) {
      if (/\.(xml|rels)$/.test(name)) docs.set(name, xml(await e.async('string')));
      if (name.startsWith('word/media/')) media.push({part:name,sha256:hash(await e.async('nodebuffer'))});
    }
    for (const required of ['[Content_Types].xml','word/document.xml','word/settings.xml','_rels/.rels']) if (!docs.has(required)) errors.push(`Missing ${required}`);
    const types = docs.get('[Content_Types].xml');
    const defaults = new Map(), overrides = new Map();
    if (types) for (const e of children(types.documentElement)) {
      const override = e.localName === 'Override', key=e.getAttribute(override?'PartName':'Extension'), map=override?overrides:defaults;
      if (map.has(key)) errors.push(`Duplicate content type ${key}`);
      map.set(key,e.getAttribute('ContentType'));
    }
    for (const [name,e] of Object.entries(zip.files)) if (!e.dir && name!=='[Content_Types].xml' && !overrides.has('/'+name) && !defaults.has(name.split('.').pop())) errors.push(`Untyped part ${name}`);
    for (const [name,doc] of docs) if (name.endsWith('.rels')) {
      const source = name==='_rels/.rels'?'':path.join(path.dirname(path.dirname(name)),path.basename(name,'.rels'));
      const ids=new Map();
      for (const e of nodes(doc,REL,'Relationship')) {
        const id=e.getAttribute('Id'),target=e.getAttribute('Target');
        if (!id || ids.has(id)) errors.push(`Invalid relationship ID ${name}:${id}`);
        ids.set(id,{target,external:e.getAttribute('TargetMode')==='External'});
        if (e.getAttribute('TargetMode')!=='External' && !zip.file(path.resolve('/',path.dirname(source),decodeURIComponent(target)).slice(1))) errors.push(`Missing relationship target ${name}:${target}`);
      }
      rels.set(source,ids);
    }
    for (const [name,doc] of docs) for (const e of nodes(doc,'*','*')) for (const a of Array.from(e.attributes)) if (a.namespaceURI===R && !rels.get(name)?.has(a.value)) errors.push(`Unresolved ${name}:${a.value}`);
    const doc=docs.get('word/document.xml'), settings=docs.get('word/settings.xml');
    const tables=doc?nodes(doc,W,'tbl'):[];
    for (const t of tables) {
      const c=children(t), grids=c.filter(n=>n.namespaceURI===W&&n.localName==='tblGrid');
      if(grids.length!==1) errors.push(`Table grid count ${grids.length}`);
      if(grids.length && c.indexOf(grids[0])>c.findIndex(n=>n.localName==='tr')) errors.push('Table grid follows row');
    }
    if(doc) for(const e of nodes(doc,W,'gridSpan')) if(Number(e.getAttributeNS(W,'val'))<1) errors.push('Invalid gridSpan');
    const body=doc&&nodes(doc,W,'body')[0];
    if(body) { const c=children(body), sect=c.find(n=>n.localName==='sectPr'); if(sect&&c.at(-1)!==sect) errors.push('sectPr is not last'); }
    const mode=settings&&nodes(settings,W,'compatSetting').find(n=>n.getAttributeNS(W,'name')==='compatibilityMode');
    return {errors, tableCount:tables.length, tables:tables.map(t=>({rows:children(t).filter(n=>n.localName==='tr').length, gridColumns:nodes(t,W,'gridCol').length})),
      paragraphs:doc?nodes(doc,W,'p').length:0, images:doc?nodes(doc,'http://schemas.openxmlformats.org/drawingml/2006/main','blip').length:0,
      altChunk:doc?nodes(doc,W,'altChunk').length:0, compatibilityMode:mode?.getAttributeNS(W,'val')||null,
      externalImages:[...rels.values()].flatMap(m=>[...m.values()]).filter(r=>r.external).length,media};
  } catch(e) { errors.push(e.message); return {errors,media}; }
}
module.exports={inspect,xml,nodes,children,W,R,REL,CT};
