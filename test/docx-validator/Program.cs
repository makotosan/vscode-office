using System;
using System.IO;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

class Program
{
    static int Main(string[] args)
    {
        if (args.Length != 1) throw new ArgumentException("Pass a DOCX file or fixture directory");
        var files = Directory.Exists(args[0]) ? Directory.GetFiles(args[0], "*.docx") : new[] { args[0] };
        if (files.Length == 0) throw new ArgumentException("No DOCX files found");
        int count = 0;
        foreach (var file in files)
        {
            Console.WriteLine(file);
            try
            {
                using var doc = WordprocessingDocument.Open(file, false);
                var validator = new OpenXmlValidator(FileFormatVersions.Office2013) { MaxNumberOfErrors = 0 };
                foreach (var error in validator.Validate(doc))
                {
                    count++;
                    Console.WriteLine($"{error.Id}: {error.Part?.Uri} {error.Path?.XPath}: {error.Description}");
                }
            }
            catch (Exception e)
            {
                count++;
                Console.WriteLine($"Package error: {e.Message}");
            }
        }
        Console.WriteLine($"Validation errors: {count}");
        return count == 0 ? 0 : 1;
    }
}
