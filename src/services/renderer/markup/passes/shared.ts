export function fillDataSlots(
  el: Element,
  alias: string,
  item: unknown,
  ignoreEmpty: boolean = true,
) {
  const slotPattern = new RegExp(
    `\\{\\{${alias}(\\.[\\.\\w\\[\\]]+)?\\}\\}`,
    "g",
  );

  const replaceSlots = (input: string) =>
    input.replace(slotPattern, (s, tail) => {
      const value = tail ? resolvePath(item, tail.slice(1)) : item;
      // don't expand if a value can't be directly resolved
      if (!ignoreEmpty && (value === null || value === undefined)) return "";
      if (typeof value === "object") return s;
      return String(value);
    });

  const walker = el.ownerDocument!.createTreeWalker(
    el,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );

  if (el.attributes) {
    for (const attr of el.attributes) {
      attr.value = replaceSlots(attr.value);
    }
  }

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = replaceSlots(node.textContent ?? "");
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as Element;
      for (const attr of elem.attributes) {
        attr.value = replaceSlots(attr.value);
      }
    }
  }
}

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
