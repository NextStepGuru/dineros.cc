/** Modal scroll-lock and scrollbar compensation cause tiny layout shifts; ignore those so table maxHeight does not jitter. */
const VIEWPORT_TABLE_HEIGHT_NOISE_PX = 8;

export function shouldSkipViewportTableHeightChange(
  next: number,
  previous: number | null,
): boolean {
  return (
    previous !== null &&
    Math.abs(next - previous) < VIEWPORT_TABLE_HEIGHT_NOISE_PX
  );
}
