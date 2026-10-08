-- Monitors: recurring scrape + change detection, swept by a Cron Trigger.
CREATE TABLE IF NOT EXISTS monitors (
  id            TEXT PRIMARY KEY,
  scope         TEXT NOT NULL,          -- key id
  url           TEXT NOT NULL,
  name          TEXT,
  tag           TEXT NOT NULL DEFAULT 'default',
  status        TEXT NOT NULL DEFAULT 'active',   -- active | paused
  created_at    TEXT NOT NULL,
  last_check_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_monitors_scope ON monitors (scope);
CREATE INDEX IF NOT EXISTS idx_monitors_active ON monitors (status, last_check_at);

CREATE TABLE IF NOT EXISTS monitor_checks (
  id            TEXT PRIMARY KEY,
  monitor_id    TEXT NOT NULL,
  change_status TEXT NOT NULL,          -- new | same | changed
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checks_monitor ON monitor_checks (monitor_id, created_at);
