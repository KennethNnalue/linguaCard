# Production coverage audit — 4 October 2026

Read-only Neon production queries. The catalogue currently has German → English only: A1 has 9 playable published episodes, 216 distinct focus lexemes, zero missing active English localizations; A2 has 2 episodes, 37 distinct focus lexemes, zero missing localizations. Vocabulary overlaps between levels, so totals must not be added as distinct overall coverage.

Across canonical German/English learning contexts there are 1,105 distinct lexemes with committed review evidence and 213 distinct owned lexemes appearing in published playable episodes. These are different populations: 213 is owned coverage, not reviewed coverage, and no coverage percentage is inferred from them. Canonical items have zero missing scheduling rows and zero missing active English localizations in the audited population. Legacy unmapped cards and per-account reviewed coverage require separate counts.

With 11 playable episodes the existing newest-200 candidate bound includes the whole production catalogue. No vocabulary-first query rewrite or new index is justified by an older-candidate omission here. Re-audit before reaching that bound.

Policy vocabulary-v2 exposes strong / overlap / starter fit. Strong is an initial product rule of at least three distinct reviewed focus words with at most half new to the vault, not a comprehension guarantee. Topic variety stays within the fit tier. Canonical identities, raw match counts, unknown scheduling and history/version boundaries remain intact.

The follow-up intersection query found 141 distinct committed-reviewed lexemes covered by published playable episodes (141/1,105, approximately 12.8% aggregate lexeme coverage; this is not per-user comprehension). A separate whole-database legacy audit found 457 cards without a canonical legacyCardId mapping, an explicit blind spot. Do not silently classify those items as unfamiliar. Reproducible queries: podcast-coverage.sql.

Representative batched vocabulary-read EXPLAIN ANALYZE in production: execution 15.2 ms, planning 3.54 ms (Neon console round trip 195 ms). Existing canonical, localization, scheduling and review-commit indexes appear in the plan; the small published catalogue is scanned/joined normally. This is one warm database sample, not an end-to-end latency budget or worst-case benchmark. Query reproduction is in podcast-recommendation-query-plan.sql; captured plan under gap-verification/recommendation-query-plan.txt.
