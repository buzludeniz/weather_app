const HH_MM = /^(\d{2}):(\d{2})$/;

/**
 * Shift an "HH:MM" wall-clock time by whole hours, wrapping around midnight.
 * Minutes are kept. Quiet hours are stored as "HH:MM" by the API.
 */
export function shiftHour(value: string, hours: number): string {
  const match = HH_MM.exec(value);
  if (match == null) throw new Error(`Not an HH:MM time: "${value}"`);
  const hour = (((Number(match[1]) + hours) % 24) + 24) % 24;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}
