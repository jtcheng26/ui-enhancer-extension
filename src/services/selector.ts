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

function safelyMatches(element: HTMLElement, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function isMeaningfulClassName(className: string): boolean {
  if (!className || className.length > 40) {
    return false;
  }

  if (
    /^(?:flex|grid|block|inline|hidden|relative|absolute|fixed|sticky)$/i.test(
      className,
    )
  ) {
    return false;
  }

  if (
    /^(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-x|space-y|w|h|min-w|min-h|max-w|max-h|text|bg|border|rounded|shadow|font|leading|tracking|justify|items|content|self|col|row|z|top|right|bottom|left)-/i.test(
      className,
    )
  ) {
    return false;
  }

  if (
    /^[A-Za-z0-9_-]*[0-9][A-Za-z0-9_-]*$/.test(className) &&
    !/[aeiou]/i.test(className)
  ) {
    return false;
  }

  if (/^[_a-zA-Z]+__[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$/.test(className)) {
    return false;
  }

  if (/(^|[-_])[a-f0-9]{6,}($|[-_])/i.test(className)) {
    return false;
  }

  return /^[a-z][a-z0-9_-]*$/i.test(className);
}

function getMeaningfulClasses(element: HTMLElement): string[] {
  return Array.from(element.classList)
    .filter(isMeaningfulClassName)
    .slice(0, 2);
}

function getSemanticAncestor(
  element: HTMLElement,
  root: Document,
): HTMLElement | null {
  let current = element.parentElement;

  while (current && current !== root.body && current !== root.documentElement) {
    const tagName = current.tagName.toLowerCase();

    if (
      [
        "main",
        "nav",
        "header",
        "footer",
        "aside",
        "section",
        "article",
        "form",
      ].includes(tagName)
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

export function buildStructuralSelector(
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

    const parent: HTMLElement | null = current.parentElement;
    const tagName = current.tagName.toLowerCase();

    if (!parent) {
      segments.unshift(tagName);
      break;
    }

    const siblings = Array.from(parent.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const sameTagSiblings = siblings.filter(
      (child) => child.tagName === current!.tagName,
    );

    if (sameTagSiblings.length === 1) {
      segments.unshift(tagName);
    } else {
      const sameTagIndex = sameTagSiblings.indexOf(current) + 1;
      segments.unshift(`${tagName}:nth-of-type(${sameTagIndex})`);
    }

    current = parent;
  }

  return segments.join(" > ");
}

function addCandidate(
  element: HTMLElement,
  root: Document,
  candidates: string[],
  selector: string | null | undefined,
) {
  if (
    !selector ||
    candidates.includes(selector) ||
    !safelyMatches(element, selector)
  ) {
    return;
  }

  candidates.push(selector);
}

export function buildImportantSelectors(
  element: HTMLElement,
  root: Document = document,
): string[] {
  const candidates: string[] = [];
  const tagName = element.tagName.toLowerCase();

  if (element.id) {
    const idSelector = `#${escapeSelectorValue(element.id)}`;
    if (isUniqueSelector(idSelector, root)) {
      addCandidate(element, root, candidates, idSelector);
    }
  }

  const dataAttributeNames = [
    "data-testid",
    "data-id",
    "data-cy",
    "data-test",
    "data-qa",
  ];

  for (const attributeName of dataAttributeNames) {
    const value = element.getAttribute(attributeName);
    if (!value) {
      continue;
    }

    const attributeSelector = `[${attributeName}="${escapeSelectorValue(value)}"]`;
    addCandidate(element, root, candidates, attributeSelector);
    addCandidate(element, root, candidates, `${tagName}${attributeSelector}`);
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    const selector = `[aria-label="${escapeSelectorValue(ariaLabel)}"]`;
    addCandidate(element, root, candidates, selector);
    addCandidate(element, root, candidates, `${tagName}${selector}`);
  }

  const ariaLabelledBy = element.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const selector = `[aria-labelledby="${escapeSelectorValue(ariaLabelledBy)}"]`;
    addCandidate(element, root, candidates, selector);
    addCandidate(element, root, candidates, `${tagName}${selector}`);
  }

  const role = element.getAttribute("role");
  if (role) {
    addCandidate(
      element,
      root,
      candidates,
      `[role="${escapeSelectorValue(role)}"]`,
    );
    addCandidate(
      element,
      root,
      candidates,
      `${tagName}[role="${escapeSelectorValue(role)}"]`,
    );
  }

  const name = element.getAttribute("name");
  if (name) {
    const selector = `[name="${escapeSelectorValue(name)}"]`;
    addCandidate(element, root, candidates, selector);
    addCandidate(element, root, candidates, `${tagName}${selector}`);
  }

  const meaningfulClasses = getMeaningfulClasses(element);
  const semanticAncestor = getSemanticAncestor(element, root);

  for (const className of meaningfulClasses) {
    addCandidate(
      element,
      root,
      candidates,
      `${tagName}.${escapeSelectorValue(className)}`,
    );

    if (semanticAncestor) {
      addCandidate(
        element,
        root,
        candidates,
        `${semanticAncestor.tagName.toLowerCase()} .${escapeSelectorValue(className)}`,
      );
      addCandidate(
        element,
        root,
        candidates,
        `${semanticAncestor.tagName.toLowerCase()} ${tagName}.${escapeSelectorValue(className)}`,
      );
    }
  }

  if (semanticAncestor) {
    addCandidate(
      element,
      root,
      candidates,
      `${semanticAncestor.tagName.toLowerCase()} ${tagName}`,
    );
  }

  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const sameTagSiblings = siblings.filter(
      (child) => child.tagName === element.tagName,
    );

    if (sameTagSiblings.length === 1) {
      addCandidate(
        element,
        root,
        candidates,
        `${parent.tagName.toLowerCase()} > ${tagName}`,
      );
    } else if (siblings[0] === element) {
      addCandidate(
        element,
        root,
        candidates,
        `${parent.tagName.toLowerCase()} > ${tagName}:first-child`,
      );
    }
  }

  addCandidate(element, root, candidates, buildStructuralSelector(element, root));

  return candidates;
}

export function buildElementSelector(
  element: HTMLElement,
  root: Document = document,
): string {
  const importantSelectors = buildImportantSelectors(element, root);
  const uniqueSelector = importantSelectors.find((selector) =>
    isUniqueSelector(selector, root),
  );

  return uniqueSelector ?? buildStructuralSelector(element, root);
}
