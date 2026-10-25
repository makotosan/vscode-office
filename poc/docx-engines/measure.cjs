const fs=require('node:fs');
const path=require('node:path');
const esbuild=require('esbuild');
async function measure() {
 const lock=JSON.parse(fs.readFileSync(path.join(__dirname,'package-lock.json'),'utf8')),result={date:new Date().toISOString(),node:process.version,candidates:{}};
 for(const name of ['vscode-html-to-docx','docx','html-to-docx','@oxfordabstracts/html-to-docx']) {
  const packageFile=path.join(__dirname,'node_modules',name,'package.json'),pkg=JSON.parse(fs.readFileSync(packageFile,'utf8'));
  const record={version:pkg.version,license:pkg.license,repository:pkg.repository,integrity:lock.packages[`node_modules/${name}`].integrity,dependencies:pkg.dependencies,bundles:{}};
  for(const platform of ['node','browser']) {
   try {const built=await esbuild.build({stdin:{contents:`module.exports = require(${JSON.stringify(name)});`,resolveDir:__dirname},platform,bundle:true,write:false,minify:true,format:'cjs',logLevel:'silent'});
    record.bundles[platform]={status:'built',bytes:built.outputFiles.reduce((n,f)=>n+f.contents.length,0)};}
   catch(e){record.bundles[platform]={status:'failed',errors:(e.errors||[]).map(e=>e.text)};}
  }
  result.candidates[name]=record;
 }
 fs.mkdirSync(path.join(__dirname,'output'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'output/bundles.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));return result;
}
if(require.main===module)measure().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={measure};
