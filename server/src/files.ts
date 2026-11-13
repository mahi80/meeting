import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { roomNameFor } from './livekit.js';

type FileMeta = {
  id: string;
  meetingId: string;
  name: string;
  size: number;
  type: string;
  created: number;
  complete: boolean;
};

const fileIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,40}$/);

const initSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().max(120).optional(),
});

const CHUNK_LIMIT = '64mb';

fs.mkdirSync(config.uploadDir, { recursive: true });

function binPath(id: string) {
  return path.join(config.uploadDir, `${id}.bin`);
}

function metaPath(id: string) {
  return path.join(config.uploadDir, `${id}.json`);
}

async function readMeta(id: string): Promise<FileMeta | undefined> {
  if (!fileIdSchema.safeParse(id).success) return undefined;
  try {
    const raw = await fs.promises.readFile(metaPath(id), 'utf8');
    const meta = JSON.parse(raw) as FileMeta;
    return meta.id === id ? meta : undefined;
  } catch {
    return undefined;
  }
}

async function writeMeta(meta: FileMeta) {
  await fs.promises.writeFile(metaPath(meta.id), JSON.stringify(meta));
}

function cleanName(input: string) {
  const base = path
    .basename(input)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 180);
  return base || 'file';
}

function contentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

type TokenClaims = {
  exp?: number;
  iss?: string;
  video?: { room?: string; roomJoin?: boolean };
};

function verifyLiveKitToken(token: string): TokenClaims | undefined {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) return undefined;
  const expected = crypto
    .createHmac('sha256', config.livekitApiSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const signature = Buffer.from(encodedSignature, 'base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
    return undefined;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as TokenClaims;
    if (claims.iss !== config.livekitApiKey) return undefined;
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return undefined;
    return claims;
  } catch {
    return undefined;
  }
}

function tokenRoom(req: Request) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return undefined;
  const claims = verifyLiveKitToken(token);
  return claims?.video?.roomJoin ? claims.video.room : undefined;
}

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export function registerFileRoutes(app: express.Express) {
  app.post(
    '/api/meetings/:id/files',
    asyncHandler(async (req, res) => {
      const meetingId = req.params.id;
      if (tokenRoom(req) !== roomNameFor(meetingId)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const parsed = initSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input', message: parsed.error.issues[0]?.message });
        return;
      }

      const id = nanoid(20);
      const meta: FileMeta = {
        id,
        meetingId,
        name: cleanName(parsed.data.name),
        size: 0,
        type: parsed.data.type || 'application/octet-stream',
        created: Date.now(),
        complete: false,
      };
      await fs.promises.writeFile(binPath(id), '');
      await writeMeta(meta);
      res.status(201).json({ fileId: id });
    }),
  );

  app.put(
    '/api/meetings/:id/files/:fileId/chunk',
    express.raw({ type: () => true, limit: CHUNK_LIMIT }),
    asyncHandler(async (req, res) => {
      const { id: meetingId, fileId } = req.params;
      if (tokenRoom(req) !== roomNameFor(meetingId)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const meta = await readMeta(fileId);
      if (!meta || meta.meetingId !== meetingId || meta.complete) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const chunk = req.body;
      if (!Buffer.isBuffer(chunk) || chunk.length === 0) {
        res.status(400).json({ error: 'empty_chunk' });
        return;
      }
      const offset = Number(req.header('x-file-offset') ?? '0');
      const current = (await fs.promises.stat(binPath(fileId))).size;
      if (!Number.isSafeInteger(offset) || offset !== current) {
        res.status(409).json({ error: 'offset_mismatch', offset: current });
        return;
      }
      await fs.promises.appendFile(binPath(fileId), chunk);
      res.json({ received: current + chunk.length });
    }),
  );

  app.post(
    '/api/meetings/:id/files/:fileId/complete',
    asyncHandler(async (req, res) => {
      const { id: meetingId, fileId } = req.params;
      if (tokenRoom(req) !== roomNameFor(meetingId)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const meta = await readMeta(fileId);
      if (!meta || meta.meetingId !== meetingId) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const size = (await fs.promises.stat(binPath(fileId))).size;
      const done: FileMeta = { ...meta, size, complete: true };
      await writeMeta(done);
      res.json({
        file: {
          id: done.id,
          name: done.name,
          size: done.size,
          type: done.type,
          url: `/api/files/${done.id}/${encodeURIComponent(done.name)}`,
        },
      });
    }),
  );

  app.get(
    '/api/files/:fileId/:name?',
    asyncHandler(async (req, res) => {
      const meta = await readMeta(req.params.fileId);
      if (!meta?.complete) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.setHeader('Content-Type', meta.type || 'application/octet-stream');
      res.setHeader('Content-Disposition', contentDisposition(meta.name));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.sendFile(binPath(meta.id), (error) => {
        if (error && !res.headersSent) res.status(404).end();
      });
    }),
  );

  // Files are shared links for a meeting, not permanent storage: drop them
  // when the server has been running for a while (or after a restart).
  const sweep = async () => {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(config.uploadDir);
    } catch {
      return;
    }
    const cutoff = Date.now() - config.uploadTtlMs;
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const meta = await readMeta(entry.slice(0, -5));
      if (meta && meta.created > cutoff) continue;
      const id = entry.slice(0, -5);
      await fs.promises.unlink(metaPath(id)).catch(() => undefined);
      await fs.promises.unlink(binPath(id)).catch(() => undefined);
    }
  };
  void sweep();
  setInterval(() => void sweep(), 60 * 60 * 1000).unref();
}
