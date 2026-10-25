# Isolated DOCX engine PoC (#11/#12)

This directory does not participate in extension builds or change export defaults.
Install its pinned dependencies with `npm ci` here (Node 24 or newer), then:

```sh
npm test
node run.cjs --all
node run.cjs --fixture=table-five-rows --engine=legacy --image-mode=embedded
```

`output/` contains source/prepared HTML, asset IDs/hashes, raw DOCX, a separate
legacy-normalized DOCX, and JSON results. The inspector never modifies inputs;
it is an integrity check, **not** a complete OOXML schema validator. SDK validation
and Word Windows/Mac acceptance are recorded separately as not-run.

`--all` deliberately exits nonzero for broken images and unrendered dynamic
fixtures. `--preprocess --chromium=/path/to/chrome` uses the existing production
dynamic-image function once per input. Mermaid requires the real renderer script
(added in the evaluation stage); without it a residual dynamic element fails.
The evaluation stage uses the real pinned KaTeX renderer and Mermaid script.
HTTP images require a controlled resolver and currently fail.

No private document input is accepted by this public fixture runner. Do not put
private originals or outputs in tracked files or CI artifacts. Unknown engines,
image modes, missing assets and unsupported linked output fail explicitly.

The model contract is in `model.d.ts`. The docx.js adapter will parse prepared
HTML into that model; HTML converters receive the same prepared HTML directly.
Asset IDs distinguish repeated occurrences; content hashes alone never identify
an image occurrence. Both engines receive the same explicit A4 size.

## docx.js (#13)

`--engine=docxjs` parses prepared HTML into a minimal structural model (also saved
as model.json). Supports headings, paragraphs, bold/italic, lists, page breaks,
tables with spans, PNG/JPEG. Unknown block/inline CSS and unsupported table sizing
produce error diagnostics rather than a fidelity pass. Arbitrary stylesheets are
not implemented; only the fixture's documented base styles are mapped.

Linked PNG/JPEG uses explicit drawing alt-description IDs, never image order or
hash, and writes assets next to the DOCX. Embedded media are retained as diagnostic
evidence; cleanup and Word link-update compatibility remain unaccepted.

docx.js 9.14.0 requires a raster fallback in its native SVG API. This PoC marks SVG
unsupported rather than silently creating a PNG preview or replacing the SVG.
This is a limitation of the current adapter, not proof docx.js cannot export SVG.

## HTML candidates (#14)

`--engine=html-to-docx` selects privateOmega 1.8.0; `--engine=oxford` selects
OxfordAbstracts 2.3.0. Both receive the identical prepared HTML/CSS and A4 options.
Their raw XML is inspected without legacy repairs, so inherited table/SVG defects
remain visible. Linked PNG/JPEG is a separate, recorded postprocessing stage
using explicit pic:cNvPr or wp:docPr descriptions. Missing/conflicting occurrence
IDs fail. Linked SVG remains unsupported pending #4.

Official npm metadata (2026-10-25): all three converter packages are MIT.
privateOmega 1.8.0 was published 2023-03-26; Oxford 2.3.0 on 2025-10-27;
legacy 1.1.3 on 2026-07-02; docx 9.14.0 on 2026-10-23. These are release dates,
not a claim about current maintenance quality. See npm package repository fields
and installed LICENSE files; the evaluation records exact tarball integrities.

## Automated comparison (#15)

```sh
dotnet build validator/Validator.csproj -c Release
node evaluate.cjs --chromium=/path/to/chrome --validator=validator/bin/Release/net8.0/Validator.dll
node measure.cjs
node export-results.cjs
```

The evaluator prepares each fixture once, including real Mermaid/KaTeX PNG
capture, then shares identical bytes/hashes across all engines and image modes.
Each raw/final package is validated against Office2013 and Office2019 using SDK
3.3.0. `overallStatus` includes SDK failure; `status` is only the lightweight
integrity/fidelity result, never full Word acceptance. Known candidate defects
are measurements and do not make the comparison command fail. `ci.cjs` fails
for unexpected input preparation or validator execution errors; green CI means
the comparison ran, not that any engine passed product acceptance.

Measurements under `measurements/` are synthetic only. Local .NET5 target
override was used because this host has no .NET8; its framework support warning
is retained as a limitation. CI uses .NET8 on Windows/Linux/macOS. Its macOS job
does not run Word. `WORD-ACCEPTANCE.md` is the separate manual worksheet.

Generation timings are one sample per heterogeneous fixture, not a controlled
performance benchmark or the ADR's cold/warm acceptance test. Bundle sizes are
standalone minified library estimates; they omit adapters, Chromium and dynamic
renderers and are not VSIX size deltas. `poc/**` is excluded from VSIX packaging.
