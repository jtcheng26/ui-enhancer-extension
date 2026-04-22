import { ExtractedValue } from "../../dom-extractor";
import { RenderSystem } from "../renderer";
import ReactDOM from "react-dom/client";
import { resolveData } from "./passes/slots";
import { expandEach } from "./passes/loops";
import { applyActions } from "./passes/actions";

export type Preprocessor = (
  data: Record<string, unknown>,
  spec: string,
) => string;

export type Visitor = (
  root: Document,
  data: Record<string, unknown>,
) => Document;

const PREPROCESSORS: Preprocessor[] = [];
const VISITORS: Visitor[] = [expandEach, applyActions, resolveData];

export const preprocessMarkup: Preprocessor = (data, spec) => {
  const processed = PREPROCESSORS.reduce(
    (markup, processor) => processor(data, markup),
    spec,
  );
  return processed;
};

export const transformDOMTree: Visitor = (root, data) => {
  const transformed = VISITORS.reduce(
    (dom, visitor) => visitor(dom, data),
    root,
  );
  return transformed;
};

export function renderMarkupString(
  root: ReactDOM.Root,
  data: Record<string, ExtractedValue>,
  spec: string,
  uiContainer: HTMLElement,
  persistedId?: string,
): { update: (data: Record<string, unknown>) => void } {
  function render(data: Record<string, unknown>) {
    const globalData = { data }; // in the future, there will be more top-level keys
    const html = preprocessMarkup(globalData, spec);
    const DOMTree = new DOMParser().parseFromString(
      `<body>${html}</body>`,
      "text/html",
    );
    const transformedDOMTree = transformDOMTree(DOMTree, globalData);
    // const finalHtml = transformedDOMTree.body.innerHTML;
    // root.render(<div id="#aui-root" />);
    uiContainer.replaceChildren(transformedDOMTree.body);
    // const existing = document.getElementById("#aui_root");
    // if (!existing) uiContainer.appendChild(transformedDOMTree.body);
    // else existing.replaceWith(transformedDOMTree.body);
  }

  render(data);

  return {
    update: (data) => render(data),
  };
}

export const MarkupRenderer: RenderSystem = {
  render: renderMarkupString,
};
