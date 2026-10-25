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
The KaTeX markup fixture is a synthetic image-capture control, not a math-engine
fidelity test. HTTP images require a controlled resolver and currently fail.

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
