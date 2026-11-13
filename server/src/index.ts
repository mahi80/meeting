import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { config } from './config.js';
import {
  approveRequest,
  denyRequest,
  expireStaleRequests,
  getJoinRequest,
  getMeeting,
  insertJoinRequest,
  insertMeeting,
  listPendingRequests,
  type MeetingRow,
} from './db.js';
import { createToken, ensureRoom } from './livekit.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '32kb' }));

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

const meetingIdSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{6,32}$/);

const createMeetingSchema = z.object({
  title: z.string().trim().max(80).optional(),
  passcode: z.string().trim().min(4).max(32),
});

const joinRequestSchema = z.object({
  name: z.string().trim().min(1).max(48),
  passcode: z.string().max(64),
});

const decideSchema = z.object({
  action: z.enum(['approve', 'deny']),
});

const hostNameSchema = z.object({
  name: z.string().trim().min(1).max(48),
});

function baseUrl(req: Request) {
  return config.publicUrl ?? `${req.protocol}://${req.get('host')}`;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hostMeeting(req: Request): MeetingRow | undefined {
  const meeting = getMeeting(req.params.id);
  const key = req.header('x-host-key');
  if (!meeting || !key || !safeEqual(key, meeting.host_key)) return undefined;
  return meeting;
}

const createLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const joinLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, livekitUrl: config.livekitUrl });
});

app.post(
  '/api/meetings',
  createLimiter,
  asyncHandler(async (req, res) => {
    const parsed = createMeetingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', message: parsed.error.issues[0]?.message });
      return;
    }

    const meetingId = nanoid(10);
    const hostKey = crypto.randomBytes(24).toString('base64url');
    const title = parsed.data.title?.trim() || 'Meeting';

    insertMeeting({
      id: meetingId,
      title,
      passcode_hash: bcrypt.hashSync(parsed.data.passcode, 10),
      host_key: hostKey,
      created_at: Date.now(),
    });
    void ensureRoom(meetingId);

    const guestUrl = `${baseUrl(req)}/m/${meetingId}`;
    const fragment = `#p=${encodeURIComponent(parsed.data.passcode)}`;
    res.status(201).json({
      meetingId,
      hostKey,
      title,
      passcode: parsed.data.passcode,
      guestUrl: `${guestUrl}${fragment}`,
      hostUrl: `${guestUrl}?host=${encodeURIComponent(hostKey)}${fragment}`,
    });
  }),
);

app.get('/api/meetings/:id', (req, res) => {
  const parsedId = meetingIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const meeting = getMeeting(parsedId.data);
  if (!meeting) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ id: meeting.id, title: meeting.title, hasPasscode: true });
});

app.post(
  '/api/meetings/:id/requests',
  joinLimiter,
  asyncHandler(async (req, res) => {
    const meeting = getMeeting(req.params.id);
    if (!meeting) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const parsed = joinRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', message: parsed.error.issues[0]?.message });
      return;
    }
    if (!bcrypt.compareSync(parsed.data.passcode, meeting.passcode_hash)) {
      res.status(403).json({ error: 'wrong_passcode', message: 'Incorrect passcode' });
      return;
    }

    expireStaleRequests();
    const requestId = nanoid(16);
    const identity = `guest-${requestId}`;
    insertJoinRequest({
      id: requestId,
      meeting_id: meeting.id,
      name: parsed.data.name,
      identity,
      status: 'pending',
      created_at: Date.now(),
      decided_at: null,
      token: null,
    });

    res.status(201).json({ requestId, status: 'pending' });
  }),
);

app.get('/api/requests/:id', (req, res) => {
  const request = getJoinRequest(req.params.id);
  if (!request) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  expireStaleRequests();
  const fresh = getJoinRequest(request.id)!;
  const meeting = getMeeting(fresh.meeting_id);

  res.json({
    status: fresh.status,
    meetingId: fresh.meeting_id,
    title: meeting?.title ?? 'Meeting',
    serverUrl: config.livekitUrl,
    token: fresh.status === 'approved' ? fresh.token : undefined,
  });
});

app.get('/api/meetings/:id/requests', (req, res) => {
  const meeting = hostMeeting(req);
  if (!meeting) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.json({
    requests: listPendingRequests(meeting.id).map((request) => ({
      id: request.id,
      name: request.name,
      createdAt: request.created_at,
    })),
  });
});

app.post(
  '/api/meetings/:id/requests/:requestId',
  asyncHandler(async (req, res) => {
    const meeting = hostMeeting(req);
    if (!meeting) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const request = getJoinRequest(req.params.requestId);
    if (!request || request.meeting_id !== meeting.id) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (request.status !== 'pending') {
      res.status(409).json({ error: 'already_decided', status: request.status });
      return;
    }

    if (parsed.data.action === 'deny') {
      denyRequest(request.id);
      res.json({ ok: true, status: 'denied' });
      return;
    }

    const token = await createToken({
      meetingId: meeting.id,
      identity: request.identity,
      name: request.name,
      role: 'guest',
    });
    approveRequest(request.id, token);
    res.json({ ok: true, status: 'approved' });
  }),
);

app.post(
  '/api/meetings/:id/host-token',
  asyncHandler(async (req, res) => {
    const meeting = hostMeeting(req);
    if (!meeting) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const parsed = hostNameSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', message: 'Name is required' });
      return;
    }

    const token = await createToken({
      meetingId: meeting.id,
      identity: 'host',
      name: parsed.data.name,
      role: 'host',
    });
    res.json({ token, serverUrl: config.livekitUrl, role: 'host', title: meeting.title });
  }),
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Meeting API listening on http://localhost:${config.port}`);
  console.log(`LiveKit: ${config.livekitUrl} (http: ${config.livekitHttpUrl})`);
});