// Windows file-name rules, checked before a rename is attempted. The Rust
// side (`rename_path`) refuses the same things; checking here as well lets the
// bulk-rename preview flag a row before anything is touched.

const RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\.|$)/i

/** Why `name` can't be used as a file or folder name, or null if it can. */
export function nameProblem(name: string): string | null {
  if (!name || name === '.' || name === '..') return '名前が空です'
  // `\` and `/` would make the rename a move into another folder.
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) return '使えない文字（\\ / : * ? " < > |）があります'
  if (/[. ]$/.test(name)) return '末尾にピリオドや空白は使えません'
  if (RESERVED.test(name)) return 'Windows の予約名です'
  if (name.length > 255) return '名前が長すぎます'
  return null
}
