-- User-configurable hard spend ceiling (credits/period). NULL = plan limit only.
ALTER TABLE api_keys ADD COLUMN spend_limit INTEGER;
