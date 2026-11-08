CREATE TABLE flights (
  id TEXT PRIMARY KEY NOT NULL,
  landed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX flights_latest ON flights (landed_at DESC, created_at DESC, id DESC);
