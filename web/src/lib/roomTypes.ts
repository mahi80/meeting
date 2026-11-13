export type Panel = 'chat' | 'people';
export type ViewMode = 'gallery' | 'speaker';

export type Session = {
  token: string;
  serverUrl: string;
  micOn: boolean;
  camOn: boolean;
};