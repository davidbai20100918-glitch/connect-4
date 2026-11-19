CREATE TABLE IF NOT EXISTS users (
  sub        TEXT PRIMARY KEY,          -- Google's stable user id; never key on email
  name       TEXT,
  email      TEXT,
  picture    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_sub   TEXT NOT NULL REFERENCES users(sub),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_id ON comments (id DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments (user_sub, created_at);
