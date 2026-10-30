# Local study math display

Read-only study prose uses one MathText renderer for explicit inline and display math: dollar delimiters, double-dollar delimiters, and the parenthesis/bracket forms used by LaTeX. Formula fields also render bare expressions. KaTeX produces HTML with MathML using bundled fonts; no external rendering service is involved.

The renderer escapes ordinary source HTML, disables trusted TeX commands, bounds macro expansion and equation size, and preserves unsupported notation as text instead of breaking a record. Literal code, paths, prices, and ordinary percentages remain readable. Percent values inside a math expression are escaped for typesetting rather than silently becoming TeX comments.

History previews and selected history evidence, saved records, formula library and edit previews, discussion explanations, concept reviews, test analyses, revision packs, journal notes, and revealed recovery answers use the shared typography. PYQ HTML retains its existing sanitised question renderer. Inputs, stored text and JSON exports retain source notation; formatting does not rewrite learner evidence. Existing concealment, hint, assessment, submission and save gates remain intact.

Verification includes mixed inline/display notation, fractions, Greek letters, powers, percentages, untrusted content, malformed notation, reactive content changes, source-index rendering and reveal gating. The full frontend suite passes 880 tests. Native acceptance with a disposable workspace verified formula and history rendering, live preview without saving, locally loaded KaTeX fonts, and no external requests or renderer exceptions.
