import {
  computeAccessibleDescription,
  computeAccessibleName,
  getRole,
  isInaccessible,
} from "dom-accessibility-api";

import type { JsonifiedDomNode } from "../types";

const MAX_TREE_DEPTH = 12;
const MAX_CHILDREN_PER_NODE = 25;
const MAX_TEXT_PREVIEW_LENGTH = 140;

const SKIPPED_TAG_NAMES = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "meta",
  "link",
  "source",
]);

const STRUCTURAL_TAG_ROLE_MAP: Record<string, string> = {
  html: "document",
  main: "main",
  nav: "navigation",
  section: "region",
  article: "article",
  aside: "complementary",
  header: "banner",
  footer: "contentinfo",
  p: "paragraph",
  ul: "list",
  ol: "list",
  li: "listitem",
  img: "img",
};

const TEXT_INPUT_TYPES = new Set([
  "button",
  "email",
  "number",
  "password",
  "search",
  "submit",
  "tel",
  "text",
  "url",
]);

const STABLE_ATTRIBUTE_NAMES = [
  "id",
  "role",
  "type",
  "name",
  "href",
  "for",
  "title",
  "placeholder",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-controls",
  "aria-checked",
  "aria-selected",
  "aria-expanded",
  "aria-pressed",
  "aria-current",
  "data-testid",
  "data-test",
  "data-qa",
  "data-cy",
  "alt",
];

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string): string {
  return value.slice(0, MAX_TEXT_PREVIEW_LENGTH);
}

function getNodeRole(element: HTMLElement): string {
  const explicitOrImplicitRole = getRole(element);

  if (explicitOrImplicitRole) {
    return explicitOrImplicitRole;
  }

  const tagName = element.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tagName)) {
    return "heading";
  }

  return STRUCTURAL_TAG_ROLE_MAP[tagName] ?? "generic";
}

function getHeadingLevel(element: HTMLElement): number | undefined {
  const tagName = element.tagName.toLowerCase();

  if (!/^h[1-6]$/.test(tagName)) {
    return undefined;
  }

  return Number.parseInt(tagName.slice(1), 10);
}

function getStableAttributes(
  element: HTMLElement,
): Record<string, string> | undefined {
  const attributes = STABLE_ATTRIBUTE_NAMES.reduce<Record<string, string>>(
    (result, attributeName) => {
      const value = element.getAttribute(attributeName);

      if (value) {
        result[attributeName] = value;
      }

      return result;
    },
    {},
  );

  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

function getOwnText(element: HTMLElement): string {
  const directText = Array.from(element.childNodes)
    .filter((node): node is Text => node.nodeType === Node.TEXT_NODE)
    .map((node) => normalizeWhitespace(node.textContent))
    .filter(Boolean)
    .join(" ");

  if (directText) {
    return truncate(directText);
  }

  if (element.children.length === 0) {
    return truncate(normalizeWhitespace(element.textContent));
  }

  return "";
}

function getControlValue(element: HTMLElement): string | undefined {
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") {
      return undefined;
    }

    if (TEXT_INPUT_TYPES.has(element.type) || element.type === "range") {
      return truncate(normalizeWhitespace(element.value));
    }

    return undefined;
  }

  if (element instanceof HTMLTextAreaElement) {
    return truncate(normalizeWhitespace(element.value));
  }

  if (element instanceof HTMLSelectElement) {
    const selectedLabel = element.selectedOptions[0]?.textContent;
    return truncate(normalizeWhitespace(selectedLabel ?? element.value));
  }

  if (element instanceof HTMLOutputElement) {
    return truncate(normalizeWhitespace(element.value));
  }

  if (element instanceof HTMLProgressElement || element instanceof HTMLMeterElement) {
    return String(element.value);
  }

  return undefined;
}

function getNodeStates(element: HTMLElement): string[] {
  const states: string[] = [];

  if (element instanceof HTMLInputElement) {
    if (
      (element.type === "checkbox" || element.type === "radio") &&
      element.checked
    ) {
      states.push("checked");
    }
  }

  if (element instanceof HTMLOptionElement && element.selected) {
    states.push("selected");
  }

  if (element.matches(":disabled")) {
    states.push("disabled");
  }

  const ariaStates = [
    "expanded",
    "pressed",
    "selected",
    "checked",
    "current",
  ] as const;

  for (const stateName of ariaStates) {
    const value = element.getAttribute(`aria-${stateName}`);

    if (value === "true") {
      states.push(stateName);
    } else if (value && stateName === "current") {
      states.push(`current:${value}`);
    }
  }

  return states;
}

function isInteractiveElement(element: HTMLElement, role: string): boolean {
  if (element.matches(":disabled")) {
    return false;
  }

  if (
    element.matches(
      [
        "a[href]",
        "button",
        "input",
        "select",
        "textarea",
        "summary",
        "[contenteditable='']",
        "[contenteditable='true']",
      ].join(","),
    )
  ) {
    return true;
  }

  if (
    [
      "button",
      "checkbox",
      "combobox",
      "link",
      "menuitem",
      "option",
      "radio",
      "searchbox",
      "slider",
      "spinbutton",
      "switch",
      "tab",
      "textbox",
    ].includes(role)
  ) {
    return true;
  }

  return element.tabIndex >= 0;
}

function shouldSkipElement(element: HTMLElement, forceInclude: boolean): boolean {
  if (SKIPPED_TAG_NAMES.has(element.tagName.toLowerCase())) {
    return true;
  }

  if (forceInclude) {
    return false;
  }

  if (element.hidden) {
    return true;
  }

  if (element instanceof HTMLInputElement && element.type === "hidden") {
    return true;
  }

  try {
    return isInaccessible(element);
  } catch {
    return false;
  }
}

function getTagHint(element: HTMLElement, role: string): string | undefined {
  const tagName = element.tagName.toLowerCase();

  if (role === "generic" || role === "textbox") {
    return tagName;
  }

  if (tagName === "input" || tagName === "select" || tagName === "textarea") {
    return tagName;
  }

  return undefined;
}

function describeNode(
  element: HTMLElement,
): Omit<JsonifiedDomNode, "children" | "truncatedChildCount" | "truncated"> {
  const role = getNodeRole(element);
  const rawName = normalizeWhitespace(computeAccessibleName(element));
  const rawDescription = normalizeWhitespace(
    computeAccessibleDescription(element),
  );
  const rawText = getOwnText(element);
  const value = getControlValue(element);
  const states = getNodeStates(element);

  const name = rawName ? truncate(rawName) : undefined;
  const description =
    rawDescription && rawDescription !== name
      ? truncate(rawDescription)
      : undefined;
  const text =
    rawText && rawText !== name && rawText !== value
      ? truncate(rawText)
      : undefined;

  return {
    role,
    tag: getTagHint(element, role),
    name,
    description,
    text,
    value,
    level: getHeadingLevel(element),
    interactive: isInteractiveElement(element, role) || undefined,
    states: states.length > 0 ? states : undefined,
    attrs: getStableAttributes(element),
  };
}

function isMeaningfulNode(
  node: Omit<JsonifiedDomNode, "children" | "truncatedChildCount" | "truncated">,
  childCount: number,
  forceInclude: boolean,
): boolean {
  if (forceInclude) {
    return true;
  }

  if (node.role !== "generic") {
    return true;
  }

  if (
    node.interactive ||
    node.name ||
    node.description ||
    node.text ||
    node.value
  ) {
    return true;
  }

  if (node.states && node.states.length > 0) {
    return true;
  }

  return false;
}

function collectMeaningfulNodes(
  element: HTMLElement,
  currentDepth: number,
  forceInclude: boolean,
): JsonifiedDomNode[] {
  if (shouldSkipElement(element, forceInclude)) {
    return [];
  }

  const childSnapshots = Array.from(element.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .flatMap((child) =>
      collectMeaningfulNodes(child, currentDepth + 1, false),
    );

  const node = describeNode(element);

  if (!isMeaningfulNode(node, childSnapshots.length, forceInclude)) {
    return childSnapshots;
  }

  if (currentDepth >= MAX_TREE_DEPTH) {
    return [
      {
        ...node,
        children: [],
        truncatedChildCount: childSnapshots.length,
        truncated: childSnapshots.length > 0 || undefined,
      },
    ];
  }

  const limitedChildren = childSnapshots.slice(0, MAX_CHILDREN_PER_NODE);

  return [
    {
      ...node,
      children: limitedChildren.length > 0 ? limitedChildren : undefined,
      truncatedChildCount:
        childSnapshots.length > limitedChildren.length
          ? childSnapshots.length
          : undefined,
      truncated:
        childSnapshots.length > limitedChildren.length || undefined,
    },
  ];
}

export function serializeAccessibilityTree(element: HTMLElement): JsonifiedDomNode {
  const [rootSnapshot] = collectMeaningfulNodes(element, 0, true);

  if (rootSnapshot) {
    return rootSnapshot;
  }

  return {
    ...describeNode(element),
    children: [],
  };
}

function formatPromptMetadata(node: JsonifiedDomNode): string[] {
  const metadata: string[] = [];

  if (node.level !== undefined) {
    metadata.push(`l=${node.level}`);
  }

  if (node.value && node.value !== node.name) {
    metadata.push(`v="${node.value}"`);
  }

  if (node.text && node.text !== node.name) {
    metadata.push(`t="${node.text}"`);
  }

  if (node.interactive) {
    metadata.push("i");
  }

  if (node.states?.length) {
    metadata.push(`s=${node.states.join(",")}`);
  }

  if (node.tag) {
    metadata.push(`tag=${node.tag}`);
  }

  if (node.truncatedChildCount !== undefined) {
    metadata.push(`kids=${node.truncatedChildCount}`);
  }

  if (node.truncated) {
    metadata.push("trunc");
  }

  return metadata;
}

function formatPromptAttrs(attributes: Record<string, string> | undefined): string {
  if (!attributes) {
    return "";
  }

  const entries = Object.entries(attributes)
    .slice(0, 4)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`);

  return entries.length > 0 ? ` attrs{${entries.join(" ")}}` : "";
}

function getPromptRole(node: JsonifiedDomNode): string {
  if (
    node.role === "generic" &&
    node.text &&
    !(node.children && node.children.length > 0)
  ) {
    return "text";
  }

  return node.role;
}

export function formatAccessibilityTree(
  node: JsonifiedDomNode,
  depth = 0,
): string {
  const indent = "  ".repeat(depth);
  const parts = [`${indent}- ${getPromptRole(node)}`];

  if (node.name) {
    parts.push(`"${node.name}"`);
  }

  const metadata = formatPromptMetadata(node);
  if (metadata.length > 0) {
    parts.push(`[${metadata.join(" ")}]`);
  }

  parts.push(formatPromptAttrs(node.attrs));

  const line = parts.join(" ").replace(/\s+$/, "");
  const children = (node.children ?? []).map((child) =>
    formatAccessibilityTree(child, depth + 1),
  );

  return [line, ...children].join("\n");
}

export function formatSnapshotPrompt(
  selector: string,
  root: JsonifiedDomNode,
): string {
  return [`sel=${selector}`, formatAccessibilityTree(root)].join("\n");
}
