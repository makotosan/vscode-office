# Mac Word save crash: Issue #9

Status: **B/D Mac overwrite and reopen acceptance passed; fresh extension export pending** (2026-10-24 JST).
Related: #7 (merged PR #8), #4 (linked SVG), #6 (CI).

## Evidence and limits

The original `draft-art16-pld.docx` is 77,982 bytes, SHA-256
`593ac260236ebdc372e3456a24c12a63206769508c195c4f7c9aaf943a0656bf`.
It was read without modification. Neither the manuscript nor the full crash log
is committed. The prior #7-normalized output was also inspected.

The supplied log reports Word 16.106.1.26021521, 2026-10-24 09:05:22 JST,
EXC_CRASH/SIGTRAP, crashed thread 30, repeated Gfx frames, mso40ui and OfficeArt.
This supports investigating graphics, but does not identify an OOXML element or
distinguish a Word bug from exporter incompatibility. `operator new` frames alone
do not prove out-of-memory. The signature says x64 while thread state is ARM64.

Reinspection confirms #7's duplicate grid, property ordering, section placement
and missing SVG Content Types. Main already contains their workaround and mode
15. Both original and #7-normalized copies still reference two SVG parts directly
via `a:blip/@r:embed`; neither has `asvg:svgBlip`. Drawing IDs are distinct (1, 2),
so duplicate IDs are not a supported explanation for this sample.

## Code-level finding and candidate correction

The pinned `vscode-html-to-docx` 1.1.3 source map identifies
`src/helpers/xml-builder.js` / `buildBinaryLargeImageOrPicture`: it emits the same
bare `a:blip r:embed` for every image type. SVG parts are named `.svg+xml`.
The #7 workaround supplies the missing Content Type but leaves drawing references
unchanged. A valid generic relationship does not prove Word SVG save support.

The package boundary now moves embedded SVG references into
`a:blip/a:extLst/a:ext[@uri='{96DAC541-7B7A-43D3-8B79-37D633B846F1}']/asvg:svgBlip/@r:embed`.
The primary SVG `a:blip/@r:embed` is removed, since no raster fallback was supplied.
Vector bytes, part names, MIME types, relationship IDs, picture sizes and text
remain intact. Raster references, external links and existing proper SVG/raster
drawings are unchanged. Conflicting extension references fail before saving.

This is vector-only output for SVG-capable Office. Consumers lacking SVG extension
support may display no picture. No PNG conversion or fallback is manufactured.
This candidate still exercises Word's SVG renderer and may not stop the crash.
The no-SVG diagnostic case helps distinguish that possibility.

References:
- [Microsoft svgBlip definition](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/2451f45e-5d77-4661-86d1-0a017fced779)
- [Microsoft CT_SVGBlip embed/link definition](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/68e0150d-6a01-4ba5-ac4d-5a18d685229b)
- [Microsoft markitdown SVG-only/fallback handling](https://github.com/microsoft/markitdown/blob/main/packages/markitdown/src/markitdown/converters/_pptx_converter.py)
  (DrawingML evidence, not a Word acceptance test).

## Reproducible isolation

```sh
node test/markdown/makeMacSaveCases.cjs INPUT.docx test/output/mac-save-cases
```

Use a new output directory. Outputs contain the private input: keep them local.
The script refuses to overwrite case files, records SHA-256 and checks the input
again after writing. It never changes the supplied document.

| Case | Changes | Local Office2019 SDK result on supplied sample |
| --- | --- | --- |
| A-original | Byte-for-byte original | Package loading fails: untyped SVG |
| B-issue7-baseline | #7 fixes; old SVG drawing | 0 errors |
| C-svg-only | SVG MIME/drawing only; original tables/settings | 24 schema errors (expected negative control) |
| D-combined | #7 fixes plus new SVG drawing | 0 errors |
| E-without-svg | D minus SVG drawings, relationships and media | 0 errors |

B includes all #7 corrections, not just tables. C includes MIME repair so its
target can load. B is not claimed byte-identical to the prior normalized ZIP.
Synthetic cases also cover table-only, SVG-only and table/two-SVG/PNG documents.

Local result: 28 Node tests pass; 10 generated fixtures have zero SDK 3.3.0 errors
for Office2019. Tests cover matrix generation, idempotence, image bytes, headers,
external links and conflicting references. Local SDK execution uses the installed
.NET 5 target override with System.IO.Packaging's framework-support warning;
CI uses .NET 8. Office2019 validation includes the SVG extension payload;
compatibilityMode remains 15. Schema version and layout mode are separate.
CI adds macOS to Windows/Linux structural tests; it does not run Word.
The desktop extension production code bundle also passed locally, resolving
dependencies from the existing installation. This was not a full asset/VSIX
packaging run. GitHub returned no workflow runs or commit statuses at the initial
PR check; remote CI success is not claimed.

## Acceptance still required

On Word for Mac 16.106.1.26021521 and a current available build, record macOS/Word
versions and A–E plus synthetic case results. Use disposable copies: open, inspect
warnings/compatibility mode, edit, save twice, close and reopen. Check both SVGs,
table cells, dimensions and layout. Validate saved copies and compare media/XML.
Confirm fresh export from the updated extension separately from sample repair.

All Mac Word UI/save tests are **not run** in this Windows session. B's SDK success
already shows why schema checks cannot close #9. The actual crash root cause and
D's effectiveness remain unconfirmed. Keep the PR draft and #9 open; do not merge
main automatically.

#4 external SVG display/update/security behavior remains unverified; preserving
links is not proof of support. #6 Word acceptance and VSIX release validation
remain separate requirements.

## User-reported Mac results (2026-10-24)

Source: https://github.com/makotosan/vscode-office/issues/9#issuecomment-6377927248
These are the user's Word for Mac observations, not local automated test results.
The report does not specify exact macOS/Word build numbers.

| Case | Reported result |
| --- | --- |
| A | Corruption warning; user did not open or repair it. Saving untested. |
| B | Save As and redisplay/reopen succeeded without error. |
| C | Save As produced a compatibility/layout warning; redisplay/reopen succeeded. |
| D | Save As and redisplay/reopen succeeded without error. |
| E | Save As and redisplay/reopen succeeded without error. |

B retains the old direct SVG references and succeeds too. The evidence therefore
neither proves the drawing change necessary nor identifies direct SVG references
as the cause of the original crash. D's success is positive compatibility evidence
for the candidate, limited to the operations reported. Do not infer repeated
in-place overwrite, full layout fidelity, or a fresh extension export from it.

Read-only reinspection of the local case XML confirms B/D/E have layout mode 15
and one table grid. C has no compatibilityMode and still has two table grids,
along with the previously recorded property/section ordering defects. Its warning
is consistent with the deliberately unrepaired compatibility settings, but there
is no warning-to-element causal proof. Do not attribute C's warning to SVG or
silently repair this negative-control case.

Still required: on disposable B and D copies, edit then overwrite-save twice,
close and reopen, record version/build, warnings, crash/no-crash and SVG/table
appearance. Compare saved XML/media and repeat with a fresh extension export.
Keep #9 and the draft PR open. No main merge is authorized by these test results.
## Follow-up: B/D overwrite acceptance passed (2026-10-24)

Source: https://github.com/makotosan/vscode-office/issues/9#issuecomment-6378106804
This report supersedes the pending B/D overwrite checks above. Word for Mac
16.106.1 (26021521), Microsoft 365, macOS Tahoe 26.5.2, Apple M4.

On Finder duplicates of B and D, the user followed the supplied procedure:
append text, Command-S, append more text, Command-S again, close, reopen, and
inspect the entered text, table and two SVG images. Both cases passed without
warnings, errors, crashes or reported display problems. These are user-reported
manual results; individual character/image screenshots and saved DOCX copies
were not independently inspected here. The Word build matches the original
crash report.

Both B (old SVG reference) and D (SVG extension) pass this acceptance. The new
SVG reference is therefore not demonstrated necessary to prevent the crash;
its causal role remains unproven. D now has positive overwrite/reopen evidence,
not merely Save As evidence. No further B/D repetition is requested.

A and C are deliberately unrepaired negative controls, not outputs of the fully
normalized exporter. Their corruption/compatibility warnings should remain part
of the isolation evidence; repairing those controls is not a release condition.
E was not included in the follow-up overwrite test, and no pass is inferred.

The remaining end-to-end acceptance is a fresh DOCX export from the updated
extension, followed by the same edit/save/reopen procedure. Saved-copy XML/media
comparison remains useful for diagnosis but has not been performed. #4 linked
SVG acceptance and #6 VSIX distribution checks remain separate. Keep #9 open and
PR #10 draft pending the fresh-export check and review of whether to retain the
SVG representation change. No merge to main has been authorized.