-- Employee per-platform license-generation permissions.
-- SuperAdmin assigns which platforms each Employee may generate license keys for.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "allow_windows_keys" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "allow_android_keys" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "allow_ios_keys" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "allow_mac_keys" boolean DEFAULT false;
