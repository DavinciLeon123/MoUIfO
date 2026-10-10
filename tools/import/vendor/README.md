# Vendored SheetJS CE (xlsx)

This directory holds one committed tarball: `xlsx-0.20.3.tgz`, the SheetJS Community Edition.

| Field | Value |
|-------|-------|
| Source | https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz (official SheetJS distribution) |
| Version | 0.20.3 |
| Size | 2409319 bytes |
| SHA-256 | `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` |
| Licence | Apache-2.0 (the `LICENSE` file is inside the tarball) |
| Dependencies | none; no install scripts |

## Why it is vendored

The `xlsx` package on the npm registry is frozen at the 0.18.5 line and carries known advisories.
SheetJS publishes current releases only on its own CDN. Version 0.20.3 is also the only reader
that returns all cell hyperlink targets of the source workbook, which the strict-sourcing rule needs.

## Rules

- Never install the package named `xlsx` from the npm registry. Only this hash-checked tarball is allowed.
  `tools/import/package.json` references it as `file:vendor/xlsx-0.20.3.tgz`, and `package-lock.json`
  records it as `file:tools/import/vendor/xlsx-0.20.3.tgz` with an sha512 integrity value.
- Dependabot ignores this package (configured in plan 01-07), so bumps never come from the registry line.
- The tarball is trusted, local input handling: the importer only reads the project's own workbook.

## Maintenance

Check cdn.sheetjs.com for releases and advisories at least yearly. To upgrade, replace the tarball
and this hash together, update the `file:` references, and run `npm install` to refresh the lockfile.

To verify at any time:

```sh
shasum -a 256 tools/import/vendor/xlsx-0.20.3.tgz
```
