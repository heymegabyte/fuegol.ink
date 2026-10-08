-- Change tracking: last-seen content per (scope, url, tag) for the changeTracking format.
CREATE TABLE IF NOT EXISTS change_tracking (
  scope        TEXT NOT NULL,          -- key id, or 'anon'
  url          TEXT NOT NULL,
  tag          TEXT NOT NULL DEFAULT 'default',
  content_hash TEXT NOT NULL,
  content      TEXT,                   -- capped markdown, for diffing
  scraped_at   TEXT NOT NULL,
  PRIMARY KEY (scope, url, tag)
);
