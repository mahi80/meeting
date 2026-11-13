const NAME_KEY = 'meet:name';

export function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage unavailable */
  }
}

export function saveHostKey(meetingId: string, hostKey: string) {
  try {
    localStorage.setItem(`meet:host:${meetingId}`, hostKey);
  } catch {
    /* storage unavailable */
  }
}

export function loadHostKey(meetingId: string) {
  try {
    return localStorage.getItem(`meet:host:${meetingId}`) ?? '';
  } catch {
    return '';
  }
}

export function savePasscode(meetingId: string, passcode: string) {
  try {
    localStorage.setItem(`meet:pwd:${meetingId}`, passcode);
  } catch {
    /* storage unavailable */
  }
}

export function loadPasscode(meetingId: string) {
  try {
    return localStorage.getItem(`meet:pwd:${meetingId}`) ?? '';
  } catch {
    return '';
  }
}

export function saveRequestId(meetingId: string, requestId: string) {
  try {
    sessionStorage.setItem(`meet:req:${meetingId}`, requestId);
  } catch {
    /* storage unavailable */
  }
}

export function loadRequestId(meetingId: string) {
  try {
    return sessionStorage.getItem(`meet:req:${meetingId}`) ?? '';
  } catch {
    return '';
  }
}

export function clearRequestId(meetingId: string) {
  try {
    sessionStorage.removeItem(`meet:req:${meetingId}`);
  } catch {
    /* storage unavailable */
  }
}

export function passcodeFromHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return '';
  return new URLSearchParams(raw).get('p')?.trim() ?? '';
}