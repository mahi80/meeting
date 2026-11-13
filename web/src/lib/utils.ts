export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function initials(name: string) {
  const clean = name.trim();
  if (!clean) return '?';
  const words = clean.split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() ?? '').join('');
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function randomPasscode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function nativeShare(text: string) {
  if (!navigator.share) return false;
  try {
    await navigator.share({ text });
    return true;
  } catch {
    return false;
  }
}

export function parseMeetingInput(value: string) {
  const input = value.trim();
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      const match = url.pathname.match(/\/m\/([A-Za-z0-9_-]+)/);
      return match?.[1] ?? '';
    } catch {
      return '';
    }
  }
  const stripped = input.replace(/^\/?m\//, '').replace(/[?#].*$/, '');
  return /^[A-Za-z0-9_-]{6,32}$/.test(stripped) ? stripped : '';
}