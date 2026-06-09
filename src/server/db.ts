import Database from "better-sqlite3";

/**
 * Opens the SQLite store that holds the Blocks (the single source of truth).
 * WAL + busy_timeout keep it safe if more than one process ever opens the file.
 */
export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  return db;
}
