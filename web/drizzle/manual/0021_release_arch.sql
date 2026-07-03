-- Per-CPU-architecture app releases: distinguish Windows x64/ARM64, mac
-- Intel(x64)/Apple-Silicon(arm64), etc. A release is now unique per
-- (platform, channel, arch, version). Existing rows backfill to 'universal'
-- (a build that runs on any arch), preserving pre-arch client behaviour:
-- clients that don't send ?arch= are treated as 'universal' and keep matching.
-- Additive & backward-compatible. Safe to re-run (IF NOT EXISTS / IF EXISTS).

ALTER TABLE app_releases
    ADD COLUMN IF NOT EXISTS arch varchar NOT NULL DEFAULT 'universal';  -- universal | x64 | arm64

-- Widen uniqueness to include arch so, e.g., mac/stable 1.4.0 can exist as both
-- an Intel build and an Apple-Silicon build.
DROP INDEX IF EXISTS idx_app_releases_platform_channel_version;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_releases_platform_channel_arch_version
    ON app_releases (platform, channel, arch, version);
