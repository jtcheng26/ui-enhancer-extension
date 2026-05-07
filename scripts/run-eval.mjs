import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://example.test/",
});

const { window } = dom;

const globals = [
  "window",
  "document",
  "DOMParser",
  "Node",
  "Element",
  "HTMLElement",
  "ShadowRoot",
  "DocumentFragment",
  "MutationObserver",
  "CustomEvent",
  "Event",
  "Text",
  "Document",
  "NodeFilter",
];

for (const key of globals) {
  globalThis[key] = window[key];
}

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: window.navigator,
});

globalThis.requestAnimationFrame ??= window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame ??= window.cancelAnimationFrame.bind(window);
globalThis.getComputedStyle ??= window.getComputedStyle.bind(window);

await import(new URL("../.eval/eval.mjs", import.meta.url));
