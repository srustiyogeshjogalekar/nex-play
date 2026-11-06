import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DEFAULT_VIDEOS = [
  { id: 'nature', title: 'Nature Beauty in 4K', sub: 'Relaxing landscapes • 4K HDR', duration: 1470, src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', poster: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=85' },
  { id: 'focus', title: 'Deep Focus Music', sub: 'Ambient • Study', duration: 3600, src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', poster: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80' },
  { id: 'tech', title: 'Tech Trends 2026', sub: 'Technology • 18 min', duration: 1090, src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', poster: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80' },
  { id: 'travel', title: 'Travel the World', sub: 'Travel • 22 min', duration: 1335, src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', poster: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80' }
];

export function createDatabase(databasePath) {
  const filePath = resolve(databasePath);
  mkdirSync(dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      duration REAL NOT NULL DEFAULT 0,
      source_url TEXT,
      poster TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('sample', 'url', 'upload')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS video_files (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
  `);

  const insertVideo = database.prepare(`
    INSERT OR IGNORE INTO videos (id, title, subtitle, duration, source_url, poster, kind)
    VALUES (?, ?, ?, ?, ?, ?, 'sample')
  `);
  for (const item of DEFAULT_VIDEOS) {
    insertVideo.run(item.id, item.title, item.sub, item.duration, item.src, item.poster);
  }
  database.prepare("INSERT OR IGNORE INTO app_state (key, value) VALUES ('premium-status', 'false')").run();

  const listStatement = database.prepare(`
    SELECT v.id, v.title, v.subtitle AS sub, v.duration,
      CASE WHEN v.kind = 'upload' THEN '/api/videos/' || v.id || '/file' ELSE v.source_url END AS src,
      v.poster, v.kind AS type
    FROM videos v ORDER BY v.created_at, v.rowid
  `);
  const getVideoStatement = database.prepare('SELECT * FROM videos WHERE id = ?');
  const insertUserVideo = database.prepare(`
    INSERT INTO videos (id, title, subtitle, duration, source_url, poster, kind)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateVideoDuration = database.prepare(`
    UPDATE videos SET duration = ? WHERE id = ? AND kind != 'sample'
  `);
  const setVideoFile = database.prepare(`
    INSERT INTO video_files (video_id, file_name, mime_type, data) VALUES (?, ?, ?, ?)
    ON CONFLICT(video_id) DO UPDATE SET file_name = excluded.file_name, mime_type = excluded.mime_type, data = excluded.data
  `);
  const getVideoFile = database.prepare('SELECT file_name, mime_type, data FROM video_files WHERE video_id = ?');
  const deleteVideo = database.prepare('DELETE FROM videos WHERE id = ?');
  const getAllState = database.prepare('SELECT key, value FROM app_state ORDER BY key');
  const getState = database.prepare('SELECT value FROM app_state WHERE key = ?');
  const setState = database.prepare(`
    INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  const createAccountStatement = database.prepare('INSERT INTO accounts (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)');
  const getAccountByEmail = database.prepare('SELECT id, email, password_hash, password_salt FROM accounts WHERE email = ?');
  const getAccountById = database.prepare('SELECT id, email FROM accounts WHERE id = ?');
  const insertSession = database.prepare('INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)');
  const getSessionAccount = database.prepare(`
    SELECT accounts.id, accounts.email FROM account_sessions
    JOIN accounts ON accounts.id = account_sessions.account_id
    WHERE account_sessions.token_hash = ? AND account_sessions.expires_at > ?
  `);
  const deleteSession = database.prepare('DELETE FROM account_sessions WHERE token_hash = ?');
  const clearExpiredSessions = database.prepare('DELETE FROM account_sessions WHERE expires_at <= ?');

  return {
    listVideos() { return listStatement.all(); },
    getVideo(id) { return getVideoStatement.get(id); },
    updateDuration(id, duration) { updateVideoDuration.run(duration, id); },
    createVideo(item) {
      insertUserVideo.run(item.id, item.title, item.sub, item.duration, item.src, item.poster, item.type);
      return this.listVideos().find(video => video.id === item.id);
    },
    setVideoFile(id, name, mimeType, data) { setVideoFile.run(id, name, mimeType, data); },
    getVideoFile(id) { return getVideoFile.get(id); },
    deleteVideo(id) { deleteVideo.run(id); },
    getAllState() {
      return Object.fromEntries(getAllState.all().map(row => [row.key, JSON.parse(row.value)]));
    },
    getState(key) {
      const row = getState.get(key);
      return row ? JSON.parse(row.value) : undefined;
    },
    setState(key, value) { setState.run(key, JSON.stringify(value)); },
    createAccount(account) { createAccountStatement.run(account.id, account.email, account.passwordHash, account.passwordSalt); },
    getAccountByEmail(email) { return getAccountByEmail.get(email); },
    getAccountById(id) { return getAccountById.get(id); },
    createSession(tokenHash, accountId, expiresAt) {
      clearExpiredSessions.run(Date.now());
      insertSession.run(tokenHash, accountId, expiresAt);
    },
    getSessionAccount(tokenHash) { return getSessionAccount.get(tokenHash, Date.now()); },
    deleteSession(tokenHash) { deleteSession.run(tokenHash); },
    close() { database.close(); }
  };
}
