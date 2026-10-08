-- Monitor change-alerts: deliver a signed webhook when a monitored URL changes.
ALTER TABLE monitors ADD COLUMN webhook_url TEXT;
ALTER TABLE monitors ADD COLUMN webhook_headers TEXT; -- optional JSON object of extra headers
