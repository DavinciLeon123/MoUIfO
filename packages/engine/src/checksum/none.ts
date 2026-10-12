/** A sourced claim that the scheme has no checksum (SPEC §6.4): every value passes. */
export function none(_value: string): boolean {
  return true;
}
