CREATE TABLE IF NOT EXISTS journal_profile (
  id INTEGER PRIMARY KEY CHECK (id=1),
  revision INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated TEXT NOT NULL
);
