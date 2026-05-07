import { AIProvider, UIRequest } from "@/ai/providers/ai-provider";
import { AugmentationRequest, SelectedElement } from "@/types";
import { inspectSelectedDomTree } from "./dom-inspection-service";
import { validateAndParse } from "./dom-extractor";
import { RENDER_SYSTEMS, RenderSystemId } from "./renderer/renderer";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import samplehtml from "./test.html?raw";
import { ClientAIProvider } from "@/ai/providers/client-ai-provider";
import Bad from "./bad.json";
import BadUI from "./ui.txt?raw";

function createShadowRoot(anchor: Element): ShadowRoot {
  const container = anchor.ownerDocument.createElement("div");
  const shadowRoot = container.attachShadow({ mode: "open" });
  anchor.replaceWith(container);
  return shadowRoot;
}

function replaceWithShadowRoot(
  doc: Document,
  replacedElement: HTMLElement,
): HTMLElement {
  const mountAnchor = doc.createElement("div");

  const shadowRootName = "revision-root-test";

  const temp = doc.createElement(shadowRootName);
  temp.id = shadowRootName;
  // avoid race condition during createShadowRootUi coroutine
  doc.body.appendChild(temp);

  const containerId = `aui-augmentation-0`;
  mountAnchor.id = containerId;
  replacedElement.insertAdjacentElement("afterend", mountAnchor);
  replacedElement.style.display = "none";
  replacedElement.setAttribute("aria-hidden", "true");

  const container = createShadowRoot(mountAnchor);
  const root = document.createElement("div");
  container.appendChild(root);

  return root;
}

async function waitForDomToSettle(target: Node): Promise<void> {
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(finish, 0);
    });

    let timeoutId: number | null = null;

    const finish = () => {
      observer.disconnect();
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      resolve();
    };

    observer.observe(target, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    timeoutId = window.setTimeout(finish, 0);
  });

  await Promise.resolve();
}

export const reviseSample = async (
  html: string,
  prompt: string,
  strategy: RenderSystemId,
  ai: AIProvider,
) => {
  const selected: SelectedElement = {
    id: "",
    tagName: "",
    selector: "html",
    textPreview: "",
    attributes: {},
    rect: {
      top: 0,
      left: 0,
      width: 0,
      height: 0,
    },
    pageUrl: "",
    selectedAt: "",
  };
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const snapshot = inspectSelectedDomTree(selected, doc);
  if (!snapshot) {
    console.error("Failed to get snapshot");
    return;
  }
  const req: AugmentationRequest = {
    id: "1",
    prompt,
    createdAt: "",
    source: "content",
    status: "mock-submitted",
    snapshot,
  };

  const extractor = Bad; // await ai.generateExtractor(req);
  const parsed = validateAndParse(extractor, doc);
  if (!parsed.data || !parsed.root) {
    console.log(parsed.errors);
    console.error(JSON.stringify(parsed));
    console.error("Invalid extractor", JSON.stringify(extractor));
    return;
  }

  const uiReq: UIRequest = {
    prompt,
    source: "popup",
    snapshot,
    screenshot: "",
    strategy,
    data: parsed.data,
  };

//   console.log("Snapshot chars", JSON.stringify(uiReq.snapshot).length);
//   console.log("HTML chars", doc.documentElement.outerHTML.length);

  const ui = BadUI; //await ai.generateUI(uiReq);
//   console.log("generated ui");
//   console.log(ui);
  const uiContainer = replaceWithShadowRoot(doc, parsed.root as HTMLElement);
  
  const root = ReactDOM.createRoot(uiContainer);

  flushSync(() => {
    RENDER_SYSTEMS[strategy].render(root, parsed.data, ui, uiContainer);
  });

  await waitForDomToSettle(uiContainer.getRootNode());

  return doc.documentElement.outerHTML;
};

async function main() {
  const provider = new ClientAIProvider(process.env.OPENAI_API_KEY!);
  const res = await reviseSample(
    samplehtml,
    "change the color of the pause button to red",
    "markup",
    provider,
  );
  console.log(res);
}

main();
