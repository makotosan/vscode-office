# DOCX export integrity (Issue #7)

The Markdown export command passes the generator's buffer through
`normalizeDocxPackage()` before writing a file. Both future image modes must use
this same boundary. PDF and HTML exports do not call it.

## Why normalize the package

The reported unmodified DOCX (77,982 bytes, SHA-256
`593ac260236ebdc372e3456a24c12a63206769508c195c4f7c9aaf943a0656bf`)
contains one table with five rows and three columns, not five tables. Its defects
include a second identical table grid between the first and second rows,
out-of-order table properties/borders/margins and cell borders, and two SVG
parts ending in `.svg+xml` without a matching Content Type.

Full SDK validation additionally revealed that `sectPr` precedes the body
blocks, and four paragraphs put `spacing` after `ind`/`jc`. Generated merged
cells also put `gridSpan`/`vMerge` after borders and sometimes emit a zero span
for a continued vertical merge. These are fixed at the same boundary.

`vscode-html-to-docx` is pinned to 1.1.3, the version used for reproduction.
The attachment's historical installed version remains unknown. Updating or
replacing the generator requires rerunning these tests; eventually the
workarounds can be removed when upstream generates conforming packages.

The normalization uses namespace-aware XML and ZIP parsers. It:

- Removes identical duplicate grids and preserves the first grid's widths.
  Conflicting grids produce an error instead of silently losing layout data.
- Orders the affected properties using their schema order and moves the
  document-level section properties to the end of the body.
- Reconstructs a zero continuation span from the previous row's vertical merge.
- Adds an explicit `image/svg+xml` Override for each affected SVG part, retaining
  its filename, image bytes and relationships. It does not convert SVG to PNG.
- Sets the Word compatibility feature set to 15 while preserving other settings.
- Checks XML parsing, content-type coverage and internal relationship targets
  and references before returning a buffer. An error leaves the existing output
  file untouched. Unchanged XML parts and all binary media retain their bytes.

This function is a workaround for newly generated output, not a general-purpose
repair/import API or a full schema validator. Unknown properties, invalid spans,
and ambiguous grids fail explicitly. SDK validation belongs in CI, not in the
extension runtime.

## Automated checks

Use Node 24 and .NET SDK 8:

```sh
npm install --ignore-scripts
npm run test:docx
dotnet run --project test/docx-validator -- test/output/docx
npm run build
```

The tests use generated/synthetic content and tiny PNG/JPEG fixtures. The user's
original document is deliberately not committed. The test command saves nine
real-generator DOCX fixtures under the ignored `test/output/docx` directory.
CI runs them on Windows and Linux, validates every fixture with Open XML SDK
3.3.0 against the Office 2013 feature set (mode 15), and uploads the fixtures.
Tests also check that the reported five-row shape preserves text, widths,
borders, images and relationships, repeated normalization is stable, and invalid
packages cannot overwrite an existing output.

Local result on 2026-10-22: 22 tests passed, nine generated fixtures had zero SDK
errors, and the normalized copy of the attachment had zero SDK errors. The
original fails SDK package loading because of its untyped SVG parts. Validation
was executed locally using the installed .NET 5 runtime/SDK with a target
override; System.IO.Packaging reported a framework-support warning. CI targets
the supported .NET 8 runtime. The production desktop/web build passed.

## Word acceptance still required

SDK success does not prove Word's UI, SVG rendering or page layout. Attempting
to inspect the locally installed Word through Computer Use failed with
`FrameArrived timed out` and `failed to activate captured window`, before the
document was opened. The original remains unchanged.

Before closing #7, run these checks in Word 365 Windows and record its version
and build:

1. Open a newly exported five-row document and the normalized attachment copy.
   No corruption warning, repair prompt or table-property repair list may appear.
2. Confirm the title bar has no Compatibility Mode label. Inspect compatibility
   settings separately from the repair behavior.
3. Verify five rows/three columns, all cell text, widths, borders, margins,
   merged cells and both SVG images. Verify PNG/JPEG fixtures as well.
4. Save a separate copy, close it and reopen it. Never overwrite the supplied
   original. Repeat SDK validation on the saved copy.
5. For causal attribution of the original five repair entries, capture the
   repaired-copy diff/log and compare table-only, SVG-only and mode-only changes.
   The five UI repair entries have not yet been mapped one-to-one to XML defects.

#1 should share this boundary and dependency decision in its linked-image ADR.
#3 must compose its relationship edits here. #4 retains its independent SVG link
compatibility investigation. #5 feeds generated assets into that same pipeline.
#2's embedded compatibility requirement preserves behavior/content, not malformed
OOXML bytes. #6 must include #7's Word acceptance before release.
