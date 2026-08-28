# Local GATE paper evidence

This directory documents the paper files used to cross-check marks for GATE-derived questions in the shipped question bank. The PDFs and the official ZIP are intentionally machine-local and ignored by Git; [`manifest.json`](./manifest.json) is tracked so every downloaded byte can be audited by source URL, SHA-256 digest, byte size, and page count.

## What is present

| Classification | Coverage                                                | Local PDF documents |
| -------------- | ------------------------------------------------------- | ------------------: |
| Official       | CS question papers, 2007-2026                           |                  25 |
| Official       | CS1 and CS2 answer keys, 2026                           |                   2 |
| Legacy mirror  | CS question papers, 1991-2006                           |                  16 |
| Legacy mirror  | EC question papers, 1991-2002                           |                  12 |
| Legacy mirror  | EE question papers for 1997, 1998, 2001, 2002, and 2004 |                   5 |
| Readable mirror | Supplemental copies of malformed official CS 2011/2017 files |                2 |
| **Total**      | 58 distinct question papers, 2 keys, and 2 readable fallbacks |           **62** |

The official 2007-2025 CS files are the 23 PDF members of `CS.zip` in IIT Guwahati's official bulk-download folder. The two 2026 CS question papers and their two keys are direct downloads from IIT Guwahati's master-paper page. A file classified as `official` therefore has an IIT Guwahati publication path recorded in the manifest.

The pre-2007 CS files and the selected EC/EE files came from `gateexam.info`. They are explicitly classified as `legacy-mirror`, not official. They fill the period before the current official bulk archive and support the cross-discipline questions that occur in the bank. The two `readable-mirror` files are also third-party copies—not official downloads—and exist only because the corresponding official archive bytes are malformed.

## Known limits

- **CS 1990:** no PDF is in the local bundle. The current official bulk archive begins at 2007, and the configured legacy mirror begins at 1991. The manifest records this as a gap rather than presenting a secondary question page as an official paper.
- **Standalone IT, 2004-2008:** no local IT PDFs are included. The official CS archive does not contain standalone IT papers. Third-party IT PDF URLs found during acquisition returned HTTP 410, so IT mark rules cannot be described as locally PDF-verified by this bundle.
- **Two malformed files in the official archive:** the exact `CS2011.pdf` and `CS1-2017.pdf` members published in the official ZIP are missing their opening PDF catalog/header bytes and fail Poppler parsing. Their upstream bytes are retained and checksummed instead of silently rewriting them. The 2011 page count (17) was cross-checked against the separately listed `readable-mirror` copy. The 2017 session-1 page tree declares 29 pages (child counts 10 + 10 + 9), and its readable mirror also has 29; only 28 leaf page objects survive in the malformed member because its first referenced page object is missing. The manifest marks both official files as `malformed-upstream-archive-member` and records the readable fallbacks independently by URL and SHA-256.

These limitations concern local paper evidence. They do not by themselves say whether an individual question's mark can be established from another authoritative rule or source; that decision belongs in the mark audit.

## Reproduce or verify the bundle

Requirements:

- a current Node.js runtime with built-in `fetch`;
- `unzip` for the official archive; and
- Poppler's `pdfinfo` for page-count verification.

From the repository root:

```bash
# Download missing files. Existing files are preserved.
node scripts/download-gate-papers.mjs --download

# Recompute the tracked metadata after an intentional source update.
node scripts/download-gate-papers.mjs --write-manifest

# Verify the local bundle without changing it.
node scripts/download-gate-papers.mjs --verify
```

Use `--download --force` only when intentionally replacing every configured download with the currently served bytes. A source can change over time; run `--verify` before replacing anything if preserving the audited copy matters.

The verifier checks:

- that every manifest archive and PDF exists;
- SHA-256 and byte size for every file;
- page count for every PDF (including the documented upstream overrides); and
- that no unlisted PDF is present under `references/gate-papers/pdfs/`.

## Manifest fields

Each `papers` entry includes:

- `classification`: `official` or `legacy-mirror`;
- `localPath`: path relative to this directory;
- `sourceUrl`: direct file/archive acquisition URL;
- `sourcePageUrl`: the human-readable index page identifying that source;
- `paperCode`, `year`, `session`, and `documentType`;
- `sizeBytes`, `sha256`, and `pages`;
- `pageCountMethod` and `pdfValidation`; and
- `archiveId` and `archiveEntry` when the PDF came from the official ZIP.

The `knownGaps` array is part of the audit trail. Do not remove a gap merely because a question transcription exists online; add a local paper only after its provenance and bytes are recorded.

## Source indexes

- [IIT Guwahati GATE downloads](https://gate2026.iitg.ac.in/download.html) - official bulk papers for 2007-2025.
- [IIT Guwahati 2026 master papers and answer keys](https://gate2026.iitg.ac.in/QPs-answer-keys.html) - official 2026 CS sessions and keys.
- [GATE Exam Info CS previous papers](https://www.gateexam.info/previous-papers/CS/) - non-official mirror used for pre-2007 CS files and the readable 2011 fallback.
- [AglaSem 2017 CS Set 1 document page](https://docs.aglasem.com/view/d285b81c-8878-11e9-8d23-e470b83c4461) - non-official source page for the readable 2017 session-1 fallback.
