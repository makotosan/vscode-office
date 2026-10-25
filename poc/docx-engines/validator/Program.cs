using System;
using System.Collections.Generic;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
class Program {
 static int Main(string[] args) {
  if(args.Length!=2 || (args[0]!="2013" && args[0]!="2019")) throw new ArgumentException("2013|2019 path.docx");
  var errors=new List<object>();
  try {
   using var doc=WordprocessingDocument.Open(args[1],false);
   var validator=new OpenXmlValidator(args[0]=="2013"?FileFormatVersions.Office2013:FileFormatVersions.Office2019){MaxNumberOfErrors=0};
   foreach(var e in validator.Validate(doc)) errors.Add(new {id=e.Id,part=e.Part?.Uri.ToString(),path=e.Path?.XPath,description=e.Description});
  } catch(Exception e) {errors.Add(new {id="package",description=e.Message});}
  Console.WriteLine(JsonSerializer.Serialize(new {schemaTarget=args[0],sdk="3.3.0",errors}));
  return errors.Count==0?0:1;
 }
}
