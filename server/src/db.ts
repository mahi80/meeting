import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    passcode_hash TEXT NOT NULL,
    host_key TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS join_requests (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    identity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    decided_at INTEGER,
    token TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_requests_meeting_status
    ON join_requests (meeting_id, status);
`);

export type MeetingRow = {
  id: string;
  title: string;
  passcode_hash: string;
  host_key: string;
  created_at: number;
};

export type JoinRequestRow = {
  id: string;
  meeting_id: string;
  name: string;
  identity: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  created_at: number;
  decided_at: number | null;
  token: string | null;
};

export function insertMeeting(row: MeetingRow) {
  db.prepare(
    'INSERT INTO meetings (id, title, passcode_hash, host_key, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(row.id, row.title, row.passcode_hash, row.host_key, row.created_at);
}

export function getMeeting(id: string): MeetingRow | undefined {
  return db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as MeetingRow | undefined;
}

export function insertJoinRequest(row: JoinRequestRow) {
  db.prepare(
    `INSERT INTO join_requests (id, meeting_id, name, identity, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).run(row.id, row.meeting_id, row.name, row.identity, row.created_at);
}

export function getJoinRequest(id: string): JoinRequestRow | undefined {
  return db.prepare('SELECT * FROM join_requests WHERE id = ?').get(id) as
    | JoinRequestRow
    | undefined;
}

export function expireStaleRequests() {
  const cutoff = Date.now() - config.pendingTtlMs;
  db.prepare(
    "UPDATE join_requests SET status = 'expired', decided_at = ? WHERE status = 'pending' AND created_at < ?",
  ).run(Date.now(), cutoff);
}

export function listPendingRequests(meetingId: string): JoinRequestRow[] {
  expireStaleRequests();
  return db
    .prepare(
      "SELECT * FROM join_requests WHERE meeting_id = ? AND status = 'pending' ORDER BY created_at ASC",
    )
    .all(meetingId) as JoinRequestRow[];
}

export function approveRequest(id: string, token: string) {
  db.prepare(
    "UPDATE join_requests SET status = 'approved', decided_at = ?, token = ? WHERE id = ? AND status = 'pending'",
  ).run(Date.now(), token, id);
}

export function denyRequest(id: string) {
  db.prepare(
    "UPDATE join_requests SET status = 'denied', decided_at = ? WHERE id = ? AND status = 'pending'",
  ).run(Date.now(), id);
}