const TIME_PATTERN =
  /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)|(\d+(?:\.\d+)?)$/;

export function parseTimestamp(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(TIME_PATTERN);
  if (!match) return null;

  if (match[4] !== undefined) {
    const seconds = Number(match[4]);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  const hours = match[1] !== undefined ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return null;
  if (minutes >= 60 || seconds >= 60) return null;
  if (hours < 0 || minutes < 0 || seconds < 0) return null;

  return hours * 3600 + minutes * 60 + seconds;
}

export function formatTimestamp(totalSeconds: number, withTenths = false): string {
  if (!Number.isFinite(totalSeconds)) return "0:00";

  const sign = totalSeconds < 0 ? "-" : "";
  let tenths = Math.round(Math.abs(totalSeconds) * 10);
  const hours = Math.floor(tenths / 36000);
  tenths -= hours * 36000;
  const minutes = Math.floor(tenths / 600);
  tenths -= minutes * 600;
  const seconds = Math.floor(tenths / 10);
  const tenth = tenths % 10;
  const pad = (n: number) => String(n).padStart(2, "0");
  const secondPart = withTenths ? `${pad(seconds)}.${tenth}` : pad(seconds);

  if (hours > 0) return `${sign}${hours}:${pad(minutes)}:${secondPart}`;
  return `${sign}${minutes}:${secondPart}`;
}

export function formatOffset(seconds: number): string {
  const sign = seconds >= 0 ? "+" : "−";
  return `${sign}${formatTimestamp(Math.abs(seconds), true)}`;
}
