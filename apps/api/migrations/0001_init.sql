-- fuegol.ink — API keys + usage ledger (the internal commercialization authority).

CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT PRIMARY KEY,
  key_hash        TEXT NOT NULL UNIQUE,   -- SHA-256 of the plaintext key (never stored plain)
  key_prefix      TEXT NOT NULL,          -- first chars for display (fgl_live_xxxx…)
  name            TEXT,
  plan            TEXT NOT NULL DEFAULT 'free',
  monthly_credits INTEGER NOT NULL DEFAULT 1000,
  created_at      TEXT NOT NULL,
  revoked         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);

CREATE TABLE IF NOT EXISTS usage_events (
  id         TEXT PRIMARY KEY,
  key_id     TEXT NOT NULL,
  operation  TEXT NOT NULL,               -- scrape | map | crawl | batch_scrape | extract | search | parse
  credits    INTEGER NOT NULL,
  url        TEXT,
  job_id     TEXT,
  success    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_key_time ON usage_events (key_id, created_at);
