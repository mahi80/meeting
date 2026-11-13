import {
  completeFileUpload,
  initFileUpload,
  uploadFileChunk,
  type SharedFile,
} from './api';

const CHUNK_SIZE = 8 * 1024 * 1024;

export async function uploadSharedFile({
  meetingId,
  token,
  file,
  onProgress,
}: {
  meetingId: string;
  token: string;
  file: File;
  onProgress?: (fraction: number) => void;
}): Promise<SharedFile> {
  const { fileId } = await initFileUpload(
    meetingId,
    token,
    file.name,
    file.type || 'application/octet-stream',
  );

  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
    const { received } = await uploadFileChunk(meetingId, token, fileId, offset, chunk);
    offset = received;
    onProgress?.(offset / file.size);
  }

  const { file: shared } = await completeFileUpload(meetingId, token, fileId);
  onProgress?.(1);
  return shared;
}
