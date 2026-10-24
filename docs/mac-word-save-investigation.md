# Mac Word save crash: Issue #9

Status: **unresolved for SVG rendering; PNG-display control passed on Mac** (2026-10-24 JST).
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
## New article18 save failure (2026-10-24)

The user supplied a new DOCX, its source Markdown/SVGs and a crash log, and
confirmed export with Office Viewer 4.2.5 and failure during overwrite-save.
This is a new failing input: the earlier B/D acceptance does not generalize to it.
Keep the candidate unmerged and do not claim the original defect resolved.

Input DOCX SHA-256:
`1aafbd34a42c2757932e2d06f83f442840307b0a3567d238d170efc66b97bb1c`.
The input has 2 tables, 34 cells and 2 SVG drawings. CRC and Office2019 SDK
validation pass. Both embedded SVG byte streams match their supplied source
assets. Table grids and mode 15 corrections are present, but SVG drawings use
bare a:blip references: no svgBlip extension is present.

The new log reports Word 16.106.1.26021521 at 10:35:56 JST, EXC_BAD_ACCESS /
KERN_PROTECTION_FAILURE on thread 0 in Microsoft Word. This differs from the
previous thread-30 SIGTRAP/Gfx/OfficeArt signature. Unsymbolicated frames do not
identify a specific XML element or establish that the crashes share a cause.

Rechecking the distributed VSIX (4.2.5, SHA-256
`310853f5ec35c0157a8e2f3414c8286a4a4dec2d0103a8b1d263492357c10954`)
confirmed that its actual bundled normalizer produces 2 svgBlip elements for this
same input. The bundled module was executed from the installed-format archive,
not substituted with the source implementation. The resulting diagnostic DOCX
has zero SDK errors. Source-pipeline Markdown-to-DOCX export, with a stubbed VS
Code Uri and the existing template assets, also produces 2 SVG extensions and
passes SDK validation. This is not an interactive VS Code or Mac Word test.

There is an unresolved mismatch between the supplied DOCX representation and
the distributed runtime's output. User-reported version 4.2.5 is recorded as
such; do not override it with an assumption that the wrong version was installed.
A stale extension host, different active exporter, or file selection/history is
a hypothesis, not a proven cause. A full VS Code quit/restart followed by a new,
distinct output filename is the next end-to-end discriminator.

Private diagnostic copies are in
`F:/Apps/vscode-office/investigation-issue9-art18/` (not committed):
- `article18-packaged-4.2.5.docx`: supplied sample processed by actual VSIX code;
  original text and SVG bytes retained.
- `article18-fresh-export.docx`: source Markdown exported through current code.
- `isolation-cases/E-without-svg.docx`: comparison without SVG drawings/media.

Mac acceptance for these new copies is pending. First test the packaged-code
copy by editing, overwrite-saving and reopening. If it still crashes, compare
with the no-SVG diagnostic copy to isolate graphics. Do not change SVG content,
rasterize images or publish the private manuscript/logs without authorization.
No new production fix is justified by the present evidence alone.

## Retest: vector-only candidate crashes during first SVG display

The user tested the packaged-code diagnostic DOCX on Word for Mac and reports
that scrolling to the first MR/CRA SVG causes a crash before any save. The
screenshot PDF shows the Microsoft Error Reporting dialog; no additional error
code is visible in that screenshot. The new supplied log records 2026-10-24
10:56:23 JST, Word 16.106.1.26021521, EXC_BAD_ACCESS / KERN_INVALID_ADDRESS,
thread 0, mso40ui with Gfx, OfficeArt and CALayer display frames. This supports
prioritizing the drawing path but does not isolate a particular SVG/XML feature.

The exact distributed-code SVG-only candidate now has a reported rendering
failure; this cannot be explained away solely by a stale extension host or a
wrong active export version. Its earlier schema validation success was not
Word compatibility proof. Do not recommend 4.2.5 as a validated fix or claim
that SVG extension references alone resolve #9.

Microsoft's Pictures overview specifies retaining SVG references in svgBlip and
putting a rasterized PNG version in the main blip for backward compatibility:
https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/7e1f1524-1569-4aa2-a6c9-aab2d855bd48
The current candidate deliberately lacks that PNG preview. The difference is a
new concrete interoperability hypothesis, not proof of the crash cause. Its
first SVG contains text, CSS font classes, rectangles and paths; well-formedness
alone cannot prove compatibility with this Mac renderer.

The user has been asked whether to test a package retaining original SVG bytes
while adding PNG preview parts. No PNG conversion/fallback has been introduced
without that answer. Original files remain unchanged. Keep PR draft and #9 open.

### Approved SVG + PNG preview diagnostic

The user explicitly authorized testing SVG retention with PNG previews. Created
`F:/Apps/vscode-office/investigation-issue9-art18/article18-svg-with-png-preview.docx`
from the failed packaged-code diagnostic. It preserves the text and both original
SVG byte streams and existing SVG extension references. Each main a:blip now
references a newly added PNG image relationship. PNGs come from the supplied
assets with matching basenames and dimensions (1000x575 and 1200x620); they were
not newly rasterized and may differ in typography from native SVG rendering.
The source previews were visually inspected. This tests the reference/fallback
configuration, not a new SVG renderer or a claim of pixel-identical previews.

Checks passed: ZIP CRC, relationship/Content Type checks, 2 preserved SVGs plus
2 PNG previews, unchanged document text, normalization idempotence and Office2019
SDK validation (0 errors). Output size: 299331 bytes. Private audit hashes and
asset mapping are stored beside the diagnostic. Mac Word display/save acceptance
is pending. First scroll through both figures; only if display is stable should
the user edit, overwrite-save twice, close and reopen. No new VSIX or production
code change is claimed from this local diagnostic alone.

## SVG + PNG preview retest fails on second save

The user reports a crash on the second save after two text additions. The new
log records 2026-10-24 12:15:15 JST, Word 16.106.1.26021521, EXC_BAD_ACCESS /
KERN_INVALID_ADDRESS, thread 0. The top frames are CoreGraphics display-list
state/entry equality, followed by AppKit and QuartzCore drawing/layer commit.
This differs from the earlier exception stacks. The save operation was the user
trigger, but the stack does not establish that ZIP/XML serialization caused it.
The screenshot PDF shows the Microsoft Error Reporting dialog without further
technical detail.

A Word-saved DOCX was also available in the supplied test folder. Read-only
inspection shows a valid ZIP and zero Office2019 SDK errors. It contains both
reported test-text additions. Word renumbered image relationships, retained the
SVG extensions and both original SVG byte streams, and regenerated both PNGs.
The SVG parts still have .svg+xml extensions. Persisted edits do not prove the
second save completed successfully at the UI level; they do show that the disk
copy is not simply the untouched diagnostic input.

Therefore, supplying a PNG preview is not sufficient to avoid the reported
crash. It does not disable the SVG renderer: SVG references are still active.
No further production fix or replacement VSIX is justified on this evidence.
Do not claim the defect solved or attribute it solely to stale extension code.

Created a diagnostic control from the user-provided Word-saved copy:
`F:/Apps/vscode-office/investigation-issue9-art18/preview-save-retest/article18-png-display-control.docx`.
Only the two SVG drawing-extension entries are removed from document.xml. The
main PNG image references remain. All other package file bytes, including SVG
source bytes and PNG previews, are retained; text is unchanged. ZIP CRC and
Office2019 SDK validation pass (0 errors). This is a raster-display diagnostic,
not a finalized SVG export behavior. Word may remove unreferenced SVG data on
subsequent saves, so this control is not an archival copy of vector originals.
Original input and source SVGs remain separately preserved.

Next discriminators: test display/edit/save/reopen on the PNG-display control;
then, if necessary, insert the original first SVG into a blank document using
Word's own UI and repeat two edits/saves. The latter bypasses this exporter and
separates native SVG/Word/macOS behavior from generated package structure. Neither
result alone can identify a specific renderer defect. No additional test is
claimed complete until the user reports its result.

Microsoft release notes show later Word builds after 16.106.1, but the reviewed
notes do not identify a fix for this exact CoreGraphics/SVG crash. No guaranteed
update remedy is claimed:
https://learn.microsoft.com/en-us/officeupdates/release-notes-office-for-mac
## PNG-display control passed on Mac

The user reports that the PNG-display control had no problem in the Mac test,
in response to the requested display, two edit/save operations and reopen test.
The report is a general success statement, not a separate screenshot for each
operation. No new Word/macOS version was specified in this follow-up.

The returned DOCX was inspected read-only. SHA-256:
`1262cb86f9295cdf95b32f1fcea22ca33203a6aa8138aa6ef930e41cabdacedf`.
It passes ZIP CRC and Office2019 SDK validation (0 errors), retains two tables,
has no svgBlip drawing reference, and contains only the two PNG media parts.
Word removed the unreferenced SVG source parts on saving, as anticipated. Thus
retaining unused vector bytes in the initial control is not durable SVG storage.
The original source SVG files remain separately preserved.

This positive control, compared with the failed SVG-only and SVG+PNG-preview
cases, prioritizes the native SVG rendering path for the tested article18 input.
It does not identify the responsible SVG feature or prove a Word/macOS defect;
other unisolated differences and application state may still matter. PNG preview
presence alone was insufficient because SVG remained active in that candidate.

No product behavior has silently changed to raster-only. The user was asked to
choose between adding an explicit PNG export mode with separately retained source
SVGs, or continuing investigation while preserving embedded SVG rendering. The
prior permission for retaining SVG plus PNG preview is not treated as permission
to replace the final output with PNG. Keep #9 open and PR draft; no main merge.
## SVG-preserving investigation continues: minimal suffix pair

The user selected continued investigation with embedded SVG rendering retained,
rather than adding a PNG-only output mode. Do not implement a raster-only product
fallback on the basis of the successful PNG control.

Added `test/markdown/makeSvgNameCases.cjs`: given SVG and PNG preview inputs, it
creates a single-image document pair. Both embed exactly the same SVG bytes and
PNG bytes and use identical drawing XML, synthetic text, dimensions, layout and
SVG extension references. The sole intended variable is the internal SVG part
suffix: `.svg+xml` versus `.svg`, with corresponding relationship target and
Content Type override names updated consistently. This tests the generator's
unconventional media suffix without mixing font/style or document-content edits.
It is an interoperability hypothesis, not a confirmed cause.

The private MR/CRA cases are in
`F:/Apps/vscode-office/investigation-issue9-art18/minimal-svg-suffix/`:
- `01-original-suffix.docx` uses the current `.svg+xml` suffix.
- `02-standard-suffix.docx` uses `.svg`.

Both contain a PNG preview plus the untouched source SVG. Both pass Office2019
SDK validation. Node tests now total 29; the new regression asserts byte identity
of all other package content and exact SVG preservation. It writes synthetic
suffix fixtures into the CI SDK fixture directory, bringing generated fixtures
to 12. The private manuscript/SVG is not committed.

Mac test order: open 01 and confirm the image; if stable, append text/save, append
again/save, close and reopen. Repeat with 02. Report the phase of any failure.
If only 02 succeeds, the suffix becomes a strong candidate requiring a full
article18 retest before production changes. If both fail, proceed to SVG font/
text-rendering isolation and a Word-native insertion reference. If both succeed,
the minimal image alone is insufficient and document/state interactions remain.
No product code or replacement VSIX is changed yet.
