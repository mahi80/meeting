import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const isProd = process.env.NODE_ENV === 'production';

const livekitUrl = process.env.LIVEKIT_URL ?? 'ws://localhost:7880';
let livekitApiKey = process.env.LIVEKIT_API_KEY ?? '';
let livekitApiSecret = process.env.LIVEKIT_API_SECRET ?? '';

if (!isProd && (!livekitApiKey || !livekitApiSecret)) {
  // Matches the keys used by `livekit-server --dev` in docker-compose.yml
  livekitApiKey = 'devkey';
  livekitApiSecret = 'secret';
}

if (!livekitApiKey || !livekitApiSecret) {
  throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production');
}

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 8787),
  dbFile: path.resolve(process.cwd(), process.env.DB_FILE ?? 'data/meeting.db'),
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'data/uploads'),
  uploadTtlMs: 24 * 60 * 60 * 1000,
  publicUrl: process.env.PUBLIC_URL?.replace(/\/$/, ''),
  livekitUrl,
  livekitHttpUrl:
    process.env.LIVEKIT_HTTP_URL ?? livekitUrl.replace(/^ws/, 'http').replace(/\/$/, ''),
  livekitApiKey,
  livekitApiSecret,
  tokenTtlSeconds: 6 * 60 * 60,
  pendingTtlMs: 10 * 60 * 1000,
};