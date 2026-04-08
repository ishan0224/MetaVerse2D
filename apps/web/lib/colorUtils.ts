export function numberToHexColor(color: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, color >>> 0));
  return `#${clamped.toString(16).padStart(6, '0')}`;
}
