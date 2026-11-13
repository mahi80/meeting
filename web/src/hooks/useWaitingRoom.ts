import { useCallback, useEffect, useState } from 'react';
import { decideWaitingRequest, listWaitingRequests, type WaitingRequest } from '../lib/api';

export function useWaitingRoom(meetingId: string, hostKey: string, enabled: boolean) {
  const [requests, setRequests] = useState<WaitingRequest[]>([]);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !hostKey) return;
    try {
      const data = await listWaitingRequests(meetingId, hostKey);
      setRequests(data.requests);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [enabled, hostKey, meetingId]);

  useEffect(() => {
    if (!enabled) {
      setRequests([]);
      return;
    }
    void refresh();
    const interval = setInterval(refresh, 2500);
    return () => clearInterval(interval);
  }, [enabled, refresh]);

  const decide = useCallback(
    async (requestId: string, action: 'approve' | 'deny') => {
      await decideWaitingRequest(meetingId, hostKey, requestId, action);
      setRequests((current) => current.filter((request) => request.id !== requestId));
    },
    [hostKey, meetingId],
  );

  return { requests, decide, offline };
}