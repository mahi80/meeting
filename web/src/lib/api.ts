export type CreatedMeeting = {
  meetingId: string;
  hostKey: string;
  title: string;
  passcode: string;
  guestUrl: string;
  hostUrl: string;
};

export type MeetingInfo = {
  id: string;
  title: string;
  hasPasscode: boolean;
};

export type JoinStatus = {
  status: 'pending' | 'approved' | 'denied' | 'expired';
  meetingId: string;
  title: string;
  serverUrl: string;
  token?: string;
};

export type WaitingRequest = {
  id: string;
  name: string;
  createdAt: number;
};

export type HostSession = {
  token: string;
  serverUrl: string;
  role: 'host';
  title: string;
};

export type SharedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof data.error === 'string' ? data.error : 'request_failed',
      typeof data.message === 'string' ? data.message : 'Request failed',
    );
  }
  return data as T;
}

function json(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

export function createMeeting(input: { title?: string; passcode: string }) {
  return api<CreatedMeeting>('/api/meetings', json(input));
}

export function getMeeting(id: string) {
  return api<MeetingInfo>(`/api/meetings/${encodeURIComponent(id)}`);
}

export function requestJoin(id: string, name: string, passcode: string) {
  return api<{ requestId: string; status: 'pending' }>(
    `/api/meetings/${encodeURIComponent(id)}/requests`,
    json({ name, passcode }),
  );
}

export function getJoinStatus(requestId: string) {
  return api<JoinStatus>(`/api/requests/${encodeURIComponent(requestId)}`);
}

export function listWaitingRequests(meetingId: string, hostKey: string) {
  return api<{ requests: WaitingRequest[] }>(
    `/api/meetings/${encodeURIComponent(meetingId)}/requests`,
    { headers: { 'x-host-key': hostKey } },
  );
}

export function decideWaitingRequest(
  meetingId: string,
  hostKey: string,
  requestId: string,
  action: 'approve' | 'deny',
) {
  return api<{ ok: boolean; status: string }>(
    `/api/meetings/${encodeURIComponent(meetingId)}/requests/${encodeURIComponent(requestId)}`,
    json({ action }, { 'x-host-key': hostKey }),
  );
}

export function getHostSession(meetingId: string, hostKey: string, name: string) {
  return api<HostSession>(
    `/api/meetings/${encodeURIComponent(meetingId)}/host-token`,
    json({ name }, { 'x-host-key': hostKey }),
  );
}

export function initFileUpload(
  meetingId: string,
  token: string,
  name: string,
  type: string,
) {
  return api<{ fileId: string }>(
    `/api/meetings/${encodeURIComponent(meetingId)}/files`,
    json({ name, type }, { Authorization: `Bearer ${token}` }),
  );
}

export function uploadFileChunk(
  meetingId: string,
  token: string,
  fileId: string,
  offset: number,
  chunk: Blob,
) {
  return api<{ received: number }>(
    `/api/meetings/${encodeURIComponent(meetingId)}/files/${encodeURIComponent(fileId)}/chunk`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'x-file-offset': String(offset),
      },
      body: chunk,
    },
  );
}

export function completeFileUpload(meetingId: string, token: string, fileId: string) {
  return api<{ file: SharedFile }>(
    `/api/meetings/${encodeURIComponent(meetingId)}/files/${encodeURIComponent(fileId)}/complete`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}