/**
 * WEB-07: the values exactly as they are passed to the engine. Split on line breaks, surrounding
 * whitespace removed (the engine trims the same way), empty lines dropped. Letter case and inner
 * characters are never changed: the engine does not fold case, so neither does the page.
 */
export function normalise(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
