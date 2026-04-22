export function resolvePath(obj: unknown, path: string): unknown {
  // split on dots and bracket notation: "a.b[2].c" -> ["a", "b", "2", "c"]
  const keys = path.split(/\.|\[(\d+)\]/).filter(Boolean);

  return keys.reduce((curr, key) => {
    if (curr == null) return undefined;
    if (Array.isArray(curr)) return curr[Number(key)];
    if (typeof curr === "object") return (curr as Record<string, unknown>)[key];
    return undefined;
  }, obj as unknown);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
