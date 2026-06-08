-- 0015: Speed up reseller-scoped mobile report queries.
--
-- Admin/reseller mobile-report visibility joins mobile_reports.device_id to
-- license_key_activations.machine_serial (for android activations) to find the
-- issuing license key's owner. This index supports that lookup + the EXISTS
-- visibility subquery. Optional — apply when license_key_activations grows large.
CREATE INDEX IF NOT EXISTS idx_lka_machine_platform
    ON license_key_activations (machine_serial, platform);
