import crypto from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const CHUNK = 8 * 1024 * 1024;
const SIZE = 20 * 1024 * 1024 + 123;

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

const meeting = await json('/api/meetings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'upload test', passcode: '123456' }),
});

const host = await json(`/api/meetings/${meeting.meetingId}/host-token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-host-key': meeting.hostKey },
  body: JSON.stringify({ name: 'Upload test' }),
});
const auth = { Authorization: `Bearer ${host.token}` };

const file = crypto.randomBytes(SIZE);
const expected = crypto.createHash('sha256').update(file).digest('hex');

const { fileId } = await json(`/api/meetings/${meeting.meetingId}/files`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'big.bin', type: 'application/octet-stream' }),
});

let offset = 0;
while (offset < file.length) {
  const chunk = file.subarray(offset, Math.min(offset + CHUNK, file.length));
  const body = new Uint8Array(chunk);
  const { received } = await json(
    `/api/meetings/${meeting.meetingId}/files/${fileId}/chunk`,
    {
      method: 'PUT',
      headers: {
        ...auth,
        'Content-Type': 'application/octet-stream',
        'x-file-offset': String(offset),
      },
      body,
    },
  );
  console.log(`  chunk ${offset} -> ${received}/${file.length}`);
  offset = received;
}

const { file: shared } = await json(
  `/api/meetings/${meeting.meetingId}/files/${fileId}/complete`,
  { method: 'POST', headers: auth },
);

const download = await fetch(`${BASE}${shared.url}`);
const actual = crypto.createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex');

const ok = download.ok && shared.size === SIZE && actual === expected;
console.log(JSON.stringify({ ok, size: shared.size, name: shared.name }, null, 2));
process.exitCode = ok ? 0 : 1;
