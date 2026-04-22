import { Visitor } from "../markup-renderer";
import { resolvePath } from "./shared";

export const expandEach: Visitor = (root, data) => {
  // process deepest first so nested loops expand inside-out
  const eachEls = [
    ...root.querySelectorAll<HTMLElement>("[data-each]"),
  ].reverse();

  for (const el of eachEls) {
    const arrayPath = el.dataset.each!;
    const alias = el.dataset.as ?? "item";

    const items = resolvePath(data, arrayPath);
    if (!Array.isArray(items)) {
      el.remove();
      continue;
    }

    el.removeAttribute("data-each");
    el.removeAttribute("data-as");

    const fragment = root.createDocumentFragment();

    for (const item of items) {
      const clone = el.cloneNode(true) as HTMLElement;
      fillAliasSlots(clone, alias, item);
      fragment.appendChild(clone);
    }

    el.replaceWith(fragment);
  }

  return root;
};

function fillAliasSlots(el: Element, alias: string, item: unknown) {
  const slotPattern = new RegExp(
    `\\{\\{${alias}(\\.[\\.\\w\\[\\]]+)?\\}\\}`,
    "g",
  );

  const walker = el.ownerDocument!.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    node.textContent = node.textContent!.replace(slotPattern, (_, tail) => {
      const value = tail ? resolvePath(item, tail.slice(1)) : item;
      return value != null ? String(value) : "";
    });
  }

  for (const child of el.querySelectorAll("*")) {
    for (const attr of child.attributes) {
      attr.value = attr.value.replace(slotPattern, (_, tail) => {
        const value = tail ? resolvePath(item, tail.slice(1)) : item;
        return value != null ? String(value) : "";
      });
    }
  }

  // also handle attributes on el itself
  for (const attr of el.attributes) {
    attr.value = attr.value.replace(slotPattern, (_, tail) => {
      const value = tail ? resolvePath(item, tail.slice(1)) : item;
      return value != null ? String(value) : "";
    });
  }
}
