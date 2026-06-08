-- Desktop app auto-update: published installer releases per platform/channel.
-- The desktop clients poll /api/updates/{platform}/latest, compare versions,
-- then download the binary from /api/updates/{platform}/download/{id}.
-- Additive & backward-compatible. Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS app_releases (
    id             serial PRIMARY KEY,
    platform       varchar NOT NULL,                       -- windows | mac
    channel        varchar NOT NULL DEFAULT 'stable',      -- stable | beta
    version        varchar NOT NULL,                       -- semver, e.g. 1.4.0
    notes          text,                                   -- release notes / changelog
    mandatory      boolean NOT NULL DEFAULT false,         -- force clients below this version to update
    store_url      varchar,                                -- Play Store / App Store link (version-only releases)
    file_name      varchar,                                -- original upload filename (null for store-pointer releases)
    file_path      varchar,                                -- storage path relative to RELEASES_DIR
    file_size      bigint,
    content_type   varchar,
    sha256         varchar,                                -- integrity hash the client verifies (null when no file)
    is_published   boolean NOT NULL DEFAULT false,         -- draft until an admin publishes
    download_count integer NOT NULL DEFAULT 0,
    created_by     integer,
    created_at     timestamptz DEFAULT now(),
    published_at   timestamptz
);

-- One row per (platform, channel, version) — re-uploading a version replaces it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_releases_platform_channel_version
    ON app_releases (platform, channel, version);

-- "latest published for this platform/channel" lookups.
CREATE INDEX IF NOT EXISTS idx_app_releases_lookup
    ON app_releases (platform, channel, is_published);
