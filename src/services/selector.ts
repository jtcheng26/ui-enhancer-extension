function escapeSelectorValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function isUniqueSelector(selector: string, root: Document): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

export function buildElementSelector(
  element: HTMLElement,
  root: Document = document,
): string {
  const segments: string[] = [];
  let current: HTMLElement | null = element;

  while (current) {
    if (current === root.body) {
      segments.unshift("body");
      break;
    }

    if (current === root.documentElement) {
      segments.unshift("html");
      break;
    }

    if (current.id) {
      const idSelector = `#${escapeSelectorValue(current.id)}`;

      if (isUniqueSelector(idSelector, root)) {
        segments.unshift(idSelector);
        break;
      }
    }

    const parent: HTMLElement | null = current.parentElement;
    const tagName = current.tagName.toLowerCase();
    const currentTagName = current.tagName;

    if (!parent) {
      segments.unshift(tagName);
      break;
    }

    const sameTagSiblings = Array.from(parent.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    ).filter(
      (child) => child.tagName === currentTagName,
    );
    const sameTagIndex = sameTagSiblings.indexOf(current) + 1;
    const segment =
      sameTagSiblings.length > 1
        ? `${tagName}:nth-of-type(${sameTagIndex})`
        : tagName;

    segments.unshift(segment);
    current = parent;
  }

  return segments.join(" > ");
}
