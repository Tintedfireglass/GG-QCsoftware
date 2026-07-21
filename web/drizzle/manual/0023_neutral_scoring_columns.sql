-- White-label the scoring schema: drop the brand name from column and table
-- identifiers. Names follow the vocabulary already in qc_results (health_id),
-- so the scoring outputs read as health_score / health_grade / health_hash.
--
-- RENAME is metadata-only in Postgres: no table rewrite, no data movement, and
-- instantaneous regardless of row count. It does take a brief ACCESS EXCLUSIVE
-- lock, so run it alongside the matching deploy rather than long before it —
-- code still querying the old names will error until the new build is serving.
--
-- The desktop client contract is NOT affected: it posts `pramaanScore` etc. as
-- JSON wire fields, which the submit schema still accepts and maps internally.

ALTER TABLE qc_results RENAME COLUMN pramaan_score TO health_score;
ALTER TABLE qc_results RENAME COLUMN pramaan_grade TO health_grade;
ALTER TABLE qc_results RENAME COLUMN pramaan_hash TO health_hash;
ALTER TABLE qc_results RENAME COLUMN pramaan_category_scores TO category_scores;
ALTER TABLE qc_results RENAME COLUMN pramaan_risk_flags TO risk_flags;
ALTER TABLE qc_results RENAME COLUMN pramaan_algorithm_version TO scoring_algorithm_version;

ALTER TABLE pramaan_scoring_versions RENAME TO scoring_versions;
