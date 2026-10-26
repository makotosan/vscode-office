const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { parse } = require('node-html-parser');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const css = 'body{font-family:Arial;font-size:11pt}table{border-collapse:collapse}td,th{border:1px solid #222;padding:4px}h1{font-size:20pt}.page-break{page-break-after:always}';

function documentHtml(body) { return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`; }
async function prepare(html, { baseDir = __dirname, imageMode = 'embedded', workDir, chromium, preprocess = false } = {}) {
  if (!['embedded', 'linked'].includes(imageMode)) throw new Error('Unknown image mode');
  const sourceHash = hash(html);
  const originalHtml = html;
  if (preprocess) {
    if (!workDir) throw new Error('Dynamic rendering needs a work directory');
    if(html.includes('class="mermaid"')) {
      const script=pathToFileURL(path.join(path.dirname(require.resolve('mermaid')),'mermaid.min.js')).href;
      html=html.replace('</body>',`<script src="${script}"></script><script>mermaid.initialize({startOnLoad:true,securityLevel:'strict'});</script></body>`);
    }
    if(html.includes('class="katex')) {
      const katexDir=path.dirname(require.resolve('katex'));
      const sheet=pathToFileURL(path.join(katexDir,'katex.min.css')).href;
      html=html.replace('</head>',`<link rel="stylesheet" href="${sheet}"></head>`);
    }
    const entry = path.resolve(__dirname, '../../src/service/markdown/html-export.js');
    const source = fs.readFileSync(entry, 'utf8') + '\nexport { replaceDynamicContentWithImages };';
    const code = require('esbuild').transformSync(source, {format: 'cjs'}).code;
    const localRequire = createRequire(__filename);
    const module = {exports: {}};
    vm.runInNewContext(code, {module, exports: module.exports, Buffer, process, console,
      require: name => name === './outline' ? {} : name === './docx-package' ? {} : localRequire(name)});
    html = await module.exports.replaceDynamicContentWithImages(html, {executablePath: chromium,puppeteerArgs:process.env.CI&&process.platform==='linux'?['--no-sandbox']:[]}, path.join(workDir, 'dynamic.docx'));
  }
  const root = parse(html);
  if (root.querySelector('.mermaid, .katex, .katex-display')) throw new Error('Dynamic content was not rendered; provide --chromium and --preprocess');
  const assets = [];
  for (const element of root.querySelectorAll('img')) {
    const sourceUri = element.getAttribute('src') || '';
    let bytes, mime;
    const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(sourceUri);
    if (match) { mime = match[1]; bytes = Buffer.from(match[2], 'base64'); }
    else {
      if (/^https?:/i.test(sourceUri)) throw new Error('Network image input requires an explicit controlled resolver (unsupported)');
      if (/^[a-z][a-z\d+.-]*:/i.test(sourceUri) && !sourceUri.startsWith('file:')) throw new Error('Unsupported image URI');
      const file = sourceUri.startsWith('file:') ? fileURLToPath(sourceUri) : path.resolve(baseDir, decodeURIComponent(sourceUri));
      bytes = fs.readFileSync(file);
      mime = ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'})[path.extname(file).toLowerCase()];
    }
    if (!['image/png','image/jpeg','image/svg+xml'].includes(mime) || !bytes.length) throw new Error('Unsupported or empty image');
    const dimension = name => { const n = Number(element.getAttribute(name)); if (!Number.isFinite(n) || n <= 0) throw new Error(`Image needs a positive ${name}`); return n; };
    const id = `asset-${assets.length + 1}`;
    assets.push({id, sourceUri, mime, bytes, sha256: hash(bytes), widthPx:dimension('width'), heightPx:dimension('height')});
    element.setAttribute('data-poc-asset-id', id);
    element.setAttribute('alt', `poc-asset:${id}`);
    element.setAttribute('src', `data:${mime};base64,${bytes.toString('base64')}`);
  }
  return { html:root.toString(), originalHtml, css, sourceHash, inputHash:hash(root.toString()), assets, imageMode,
    page:{widthTwips:11906,heightTwips:16838} };
}
module.exports = { prepare, hash, documentHtml, css };
