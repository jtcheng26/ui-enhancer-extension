import { ExtractedValue } from "../../dom-extractor";
import { RenderSystem } from "../renderer";
import ReactDOM from "react-dom/client";
import { resolveData } from "./passes/slots";
import { expandEach } from "./passes/loops";

export type Preprocessor = (
  data: Record<string, unknown>,
  spec: string,
) => string;

export type Visitor = (
  root: Document,
  data: Record<string, unknown>,
) => Document;

const PREPROCESSORS: Preprocessor[] = [resolveData];
const VISITORS: Visitor[] = [expandEach];

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
    const finalHtml = transformedDOMTree.body.innerHTML;
    root.render(<div dangerouslySetInnerHTML={{ __html: finalHtml }} />);
  }

  render(data);

  return {
    update: (data) => render(data),
  };
}

export const MarkupRenderer: RenderSystem = {
  render: renderMarkupString,
};
