/**
 * Specificity of a regex source (DEC-064): the number of literal characters. Anchors, groups and the
 * `?:` of a non-capturing group, alternation, quantifiers, character classes (whatever their
 * content), the wildcard `.` and class escapes such as `\d`, `\w` and `\s` count zero; every other
 * character, including an escaped literal such as `\.`, counts one. It reads the model's regex only,
 * never the input value.
 */
export function specificity(source: string): number {
  let count = 0;
  let i = 0;
  while (i < source.length) {
    const char = source.charAt(i);
    if (char === '\\') {
      const escaped = source.charAt(i + 1);
      if (escaped !== '' && !'dDwWsSbB'.includes(escaped)) count += 1;
      i += 2;
    } else if (char === '[') {
      i += 1;
      while (i < source.length && source.charAt(i) !== ']') i += source.charAt(i) === '\\' ? 2 : 1;
      i += 1;
    } else if (char === '(') {
      i += source.startsWith('?:', i + 1) ? 3 : 1;
    } else if (char === '{') {
      const quantifier = /^\{[0-9]+(?:,[0-9]*)?\}/.exec(source.slice(i));
      if (quantifier === null) {
        count += 1;
        i += 1;
      } else {
        i += quantifier[0].length;
      }
    } else {
      if (!')|^$*+?.'.includes(char)) count += 1;
      i += 1;
    }
  }
  return count;
}
