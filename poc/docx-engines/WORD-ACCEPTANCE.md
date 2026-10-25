# Word acceptance worksheet (#15)

Automated XML/schema results do not satisfy this worksheet. Start with a COPY of
each generated case. Record engine/version, input/output SHA-256, OS/CPU, Word
version/build, fonts, image mode and link-update conditions.

| Case | Open/repair | Compatibility label | Table/text/images | Edit/save 1 | Edit/save 2 | Close/reopen | Saved-copy SDK |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Each synthetic fixture, Windows | not-run | not-run | not-run | not-run | not-run | not-run | not-run |
| Each synthetic fixture, macOS | not-run | not-run | not-run | not-run | not-run | not-run | not-run |
| Private article16 original/control copies | not-run | not-run | not-run | not-run | not-run | not-run | not-run |
| Private article18 SVG regression | not-run | not-run | not-run | not-run | not-run | not-run | not-run |

1. Open the raw candidate and its explicitly named postprocessed final copy.
   Record every repair prompt/log. Do not accept a repair and then report that
   the generated document opened without repair.
2. Inspect title-bar compatibility mode separately from corruption/repair.
3. Check rows, columns, merged cells, widths, borders, page breaks and images.
4. Edit and save the working copy, edit again and save a second time; close and
   reopen. Saved bytes alone do not prove the save operation completed normally.
5. Re-run SDK validation on the Word-saved copy. Record its hash and the matching
   original result.json. Distinguish Windows and Mac results.
6. Linked images: record whether Word updated links and any external-link prompt;
   relocation/offline behavior and SVG linked remain #3/#4 acceptance items.

Keep private manuscripts and full crash logs outside Git/CI. In private article16
controls vary only table repairs, SVG metadata/relationships, both, and a separate
compatibility-only control. An original DOCX without its source Markdown is a
reproduction/package-audit input, not an equivalent cross-engine HTML input.
Carry article18 and PR #10's SVG suffix control forward; article16 success cannot
be generalized. Never replace embedded SVG with PNG to obtain a passing result.

Attempt in this session: Word launched, accessibility text was readable. The open
action failed with `coordinate input geometry is unavailable`; refreshed screen
capture failed with `FrameArrived timed out: timed out waiting on channel`.
No generated/private DOCX was opened or edited by this UI attempt. macOS is not
available on this Windows host. All acceptance rows above remain not-run.
