-- Add QR label download permission flag to users.
-- Defaults to TRUE so all existing users retain access automatically.
-- SuperAdmin and admin-tier roles can set this to FALSE per user via the user edit page.
ALTER TABLE "users" ADD COLUMN "allow_qr_label_download" boolean DEFAULT true;
