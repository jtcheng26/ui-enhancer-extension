import { Visitor } from "../markup-renderer";
import { resolvePath } from "./shared";

function expandAliasSlots(el: Element, alias: string, prefix: string) {
  const slotPattern = new RegExp(
    `\\{\\{${alias}(\\.[\\.\\w\\[\\]]+)?\\}\\}`,
    "g",
  );

  const replaceSlots = (input: string) =>
    input.replace(slotPattern, (s) => {
      return prefix + s.slice(s.search(slotPattern) + alias.length + 2);
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

    for (let i = 0; i < items.length; i++) {
      const clone = el.cloneNode(true) as HTMLElement;
      expandAliasSlots(clone, alias, `{{${arrayPath}[${i}]`);
      fragment.appendChild(clone);
    }

    el.replaceWith(fragment);
  }

  return root;
};
