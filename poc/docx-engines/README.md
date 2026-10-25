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
