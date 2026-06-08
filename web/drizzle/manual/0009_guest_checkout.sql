-- Guest checkout from the store website: capture buyer details on the customer
-- record + a transient generated password on the order so credentials + license
-- key can be emailed on success.
-- Additive & backward-compatible. Apply BEFORE deploying the matching app code.

-- Buyer details belong to the customer.
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS company varchar;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS phone varchar;

-- Purchased quantity — multiplies the plan's per-platform device caps + price.
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

-- Transient: holds the auto-generated password for a NEW customer only until the
-- success email is sent, then set back to NULL. Never set for existing customers.
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS pending_password varchar;
