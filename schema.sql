CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  path TEXT NOT NULL,
  ref TEXT,
  ua TEXT,
  ip TEXT
);

CREATE TABLE IF NOT EXISTS media_meta (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  size INTEGER,
  mime TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS admin_settings (
  id INTEGER PRIMARY KEY,
  key_hash TEXT NOT NULL,
  session_secret TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
