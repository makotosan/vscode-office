function adapter(packageName) {
 return {async generate(input) {
  if(input.imageMode==='linked'&&input.assets.some(a=>a.mime==='image/svg+xml'))throw new Error('UNSUPPORTED: linked SVG awaits #4 Word acceptance');
  const exported=require(packageName),convert=exported.default||exported;
  const result=await convert(input.html,'',{pageSize:{width:input.page.widthTwips,height:input.page.heightTwips}},'');
  const bytes=Buffer.isBuffer(result)?result:Buffer.from(await result.arrayBuffer());
  return {bytes,diagnostics:[],...(input.imageMode==='linked'?{postprocess:raw=>require('./docxjs.cjs').linkImages(raw,input),postprocessName:'explicit-id-image-links'}:{})};
 }};
}
module.exports={adapter};
