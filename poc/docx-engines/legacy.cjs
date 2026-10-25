const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
async function generate(input) {
  if(input.imageMode!=='embedded') throw new Error('UNSUPPORTED: legacy linked mode is not implemented (#3/#4)');
  const result=await require('vscode-html-to-docx')(input.html,'',{pageSize:{width:input.page.widthTwips,height:input.page.heightTwips}},'');
  return {bytes:Buffer.isBuffer(result)?result:Buffer.from(await result.arrayBuffer()),diagnostics:[]};
}
function normalizer() {
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../src/service/markdown/docx-package.js'),'utf8'),
    {module,exports:module.exports,require:createRequire(__filename),Buffer,console});
  return module.exports.normalizeDocxPackage;
}
module.exports={generate,normalizer};
