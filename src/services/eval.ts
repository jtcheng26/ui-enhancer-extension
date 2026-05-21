import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";

import { AIProvider } from "@/ai/providers/ai-provider";
import { ClientAIProvider } from "@/ai/providers/client-ai-provider";
import type {
  SelectedDomTreeSnapshot,
  SelectedElement,
  SelectedMarkupContext,
  UiGenerationAgentCommandPayload,
  UiGenerationAgentCssInjection,
  UiGenerationAgentMode,
  UiGenerationAgentResponse,
} from "@/types";
import sampleHtml from "./test.html?raw";
import {
  inspectSelectedDomTree,
  inspectSelectedMarkupContext,
} from "./dom-inspection-service";
import { DOMExtractorSpec, validateAndParse } from "./dom-extractor";
import { RENDER_SYSTEMS, RenderSystemId } from "./renderer/renderer";

type EvalMode = "prompt" | "auto";

interface EvalJobConfig {
  id?: string;
  html?: string;
  htmlPath?: string;
  prompt?: string;
  promptPath?: string;
  mode?: EvalMode;
  rootSelector?: string;
}

interface EvalConfig {
  mode: EvalMode;
  rootSelector: string;
  strategy: RenderSystemId;
  outputDir?: string;
  maxAgentTurns: number;
  autoApproveFindings: boolean;
  jobs: EvalJobConfig[];
}

interface LoadedEvalJob {
  id: string;
  html: string;
  prompt: string;
  mode: EvalMode;
  rootSelector: string;
}

const DEFAULT_AUTO_PROMPT = "Fix usability and design issues in the UI";

const EVAL_CONFIG: EvalConfig = {
  mode: "prompt",
  rootSelector: "body",
  strategy: "markup",
  outputDir: process.env.EVAL_OUTPUT_DIR || undefined,
  maxAgentTurns: 16,
  autoApproveFindings: true,
  jobs: [
    {
      id: "sample",
      html: sampleHtml,
      prompt: "change the color of the pause button to red",
      mode: "prompt",
    },
  ],
};

function makeSelectedElement(
  doc: Document,
  selector: string,
  id = "eval-root",
): SelectedElement {
  const element = doc.querySelector<HTMLElement>(selector);

  return {
    id,
    tagName: element?.tagName ?? "",
    selector,
    textPreview: element?.textContent?.trim().slice(0, 240) ?? "",
    attributes: element
      ? Object.fromEntries(
          Array.from(element.attributes).map((attribute) => [
            attribute.name,
            attribute.value,
          ]),
        )
      : {},
    rect: {
      top: 0,
      left: 0,
      width: 0,
      height: 0,
    },
    pageUrl: doc.location?.href ?? "https://eval.local/",
    selectedAt: new Date().toISOString(),
  };
}

function createDocument(html: string) {
  return new DOMParser().parseFromString(html, "text/html");
}

function waitForDomToSettle(target: Node): Promise<void> {
  return new Promise<void>((resolve) => {
    let timeoutId: number | null = null;
    const finish = () => {
      observer.disconnect();
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(finish, 0);
    });

    observer.observe(target, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    timeoutId = window.setTimeout(finish, 0);
  });
}

async function waitForRender() {
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function appendHeadStyle(doc: Document, css: string, id: string) {
  const style = doc.createElement("style");
  style.id = id;
  style.setAttribute("data-aui-eval-style", id);
  style.textContent = css;
  (doc.head ?? doc.documentElement).appendChild(style);
  return style;
}

function createShadowMount(
  doc: Document,
  replacedElement: HTMLElement,
  id: string,
) {
  const mountAnchor = doc.createElement("div");
  mountAnchor.id = `aui-augmentation-${id}`;
  replacedElement.insertAdjacentElement("afterend", mountAnchor);
  replacedElement.style.display = "none";
  replacedElement.setAttribute("aria-hidden", "true");

  const shadowHost = doc.createElement("div");
  shadowHost.id = `aui-shadow-host-${id}`;
  mountAnchor.replaceWith(shadowHost);

  const shadowRoot = shadowHost.attachShadow({ mode: "open" });
  const uiContainer = doc.createElement("div");
  uiContainer.setAttribute("data-aui-shadow-content", id);
  shadowRoot.appendChild(uiContainer);

  return uiContainer;
}

async function renderUiIntoDocument(
  doc: Document,
  extractor: DOMExtractorSpec,
  spec: string,
  strategy: RenderSystemId,
  id: string,
  css?: UiGenerationAgentCssInjection,
) {
  const parsed = validateAndParse(extractor, doc);

  if (!parsed.data || !(parsed.root instanceof HTMLElement)) {
    throw new Error(
      `Unable to render UI: ${parsed.errors.join("; ") || "extractor did not resolve"}`,
    );
  }

  const data = parsed.data;

  if (css?.css) {
    appendHeadStyle(doc, css.css, `aui-agent-style-${id}`);
  }

  const uiContainer = createShadowMount(doc, parsed.root, id);
  const root = ReactDOM.createRoot(uiContainer);

  flushSync(() => {
    RENDER_SYSTEMS[strategy].render(root, data, spec, uiContainer, id);
  });

  await waitForDomToSettle(uiContainer.getRootNode());
  return uiContainer;
}

async function renderUiDraft(
  doc: Document,
  extractor: DOMExtractorSpec,
  spec: string,
  strategy: RenderSystemId,
) {
  const parsed = validateAndParse(extractor, doc);

  if (!parsed.data || !(parsed.root instanceof HTMLElement)) {
    throw new Error(
      `Unable to render UI draft: ${parsed.errors.join("; ") || "extractor did not resolve"}`,
    );
  }

  const data = parsed.data;
  const originalDisplay = parsed.root.style.display;
  const originalAriaHidden = parsed.root.getAttribute("aria-hidden");
  const uiContainer = createShadowMount(doc, parsed.root, `draft-${crypto.randomUUID()}`);

  try {
    const root = ReactDOM.createRoot(uiContainer);
    flushSync(() => {
      RENDER_SYSTEMS[strategy].render(root, data, spec, uiContainer);
    });
    await waitForDomToSettle(uiContainer.getRootNode());
    return uiContainer.innerHTML;
  } finally {
    const shadowHost = uiContainer.getRootNode();
    if (shadowHost instanceof ShadowRoot) {
      shadowHost.host.remove();
    }

    parsed.root.style.display = originalDisplay;
    if (originalAriaHidden === null) {
      parsed.root.removeAttribute("aria-hidden");
    } else {
      parsed.root.setAttribute("aria-hidden", originalAriaHidden);
    }
  }
}

async function renderCssDraft(
  doc: Document,
  css: UiGenerationAgentCssInjection,
) {
  const style = appendHeadStyle(
    doc,
    css.css,
    `aui-agent-css-draft-${crypto.randomUUID()}`,
  );

  try {
    await waitForRender();
    const target = css.rootSelector
      ? doc.querySelector<HTMLElement>(css.rootSelector)
      : doc.body;
    return target?.outerHTML ?? doc.body.outerHTML;
  } finally {
    style.remove();
  }
}

function getExtractorReferenceContext(
  doc: Document,
  selector: string,
): {
  snapshot?: SelectedDomTreeSnapshot;
  markupContext?: SelectedMarkupContext;
} {
  const selectedElement = makeSelectedElement(doc, selector, "agent-root");

  return {
    snapshot: inspectSelectedDomTree(selectedElement, doc) ?? undefined,
    markupContext: inspectSelectedMarkupContext(selectedElement, doc) ?? undefined,
  };
}

function createEvalScreenshot(label: string, html: string) {
  void label;
  void html;
  return undefined;
}

async function continueAgentOnDocument(
  ai: AIProvider,
  doc: Document,
  initialResponse: UiGenerationAgentResponse,
  basePayload: Pick<UiGenerationAgentCommandPayload, "prompt" | "mode" | "source">,
  strategy: RenderSystemId,
  config: Pick<EvalConfig, "maxAgentTurns" | "autoApproveFindings">,
) {
  let response: UiGenerationAgentResponse | null = initialResponse;
  let lastMessages = initialResponse.messages;

  for (let turn = 0; response && turn < config.maxAgentTurns; turn += 1) {
    lastMessages = response.messages;

    switch (response.status) {
      case "needsApproval": {
        if (!config.autoApproveFindings) {
          return {
            injected: false,
            messages: response.messages,
            reason: "Agent requested usability approval and autoApproveFindings is false.",
          };
        }

        response = await ai.runUiGenerationAgent({
          ...basePayload,
          messages: response.messages,
          approval: {
            approvalId: response.approvalId,
            approved: true,
            reason: "Eval auto-approved reported usability findings.",
          },
        });
        break;
      }

      case "needsExtractorResult": {
        const parsed = validateAndParse(response.extractor, doc);

        if (!parsed.data) {
          response = await ai.runUiGenerationAgent({
            ...basePayload,
            messages: response.messages,
            extractorResult: {
              toolCallId: response.toolCallId,
              extractor: response.extractor,
              valid: false,
              errors: parsed.errors,
            },
          });
          break;
        }

        const selector = response.extractor.root.selector || "body";
        const reference = getExtractorReferenceContext(doc, selector);
        const rootHtml =
          parsed.root instanceof HTMLElement
            ? parsed.root.outerHTML
            : doc.documentElement.outerHTML;

        response = await ai.runUiGenerationAgent({
          ...basePayload,
          messages: response.messages,
          extractorResult: {
            toolCallId: response.toolCallId,
            extractor: response.extractor,
            valid: true,
            data: parsed.data,
            snapshot: reference.snapshot,
            markupContext: reference.markupContext,
            screenshot: createEvalScreenshot("Extractor root", rootHtml),
          },
        });
        break;
      }

      case "needsDraftRender": {
        const draftResponse = response;
        try {
          const rendered =
            draftResponse.kind === "css"
              ? await renderCssDraft(doc, draftResponse.css)
              : await renderUiDraft(
                  doc,
                  draftResponse.extractor,
                  draftResponse.spec,
                  strategy,
                );

          response = await ai.runUiGenerationAgent({
            ...basePayload,
            messages: draftResponse.messages,
            draftRenderResult: {
              toolCallId: draftResponse.toolCallId,
              kind: draftResponse.kind,
              extractor:
                draftResponse.kind === "ui" ? draftResponse.extractor : undefined,
              spec: draftResponse.kind === "ui" ? draftResponse.spec : undefined,
              css: draftResponse.kind === "css" ? draftResponse.css : undefined,
              success: true,
              renderedHtml: rendered,
              screenshot: createEvalScreenshot("Rendered draft", rendered),
            },
          });
        } catch (error) {
          response = await ai.runUiGenerationAgent({
            ...basePayload,
            messages: draftResponse.messages,
            draftRenderResult: {
              toolCallId: draftResponse.toolCallId,
              kind: draftResponse.kind,
              extractor:
                draftResponse.kind === "ui" ? draftResponse.extractor : undefined,
              spec: draftResponse.kind === "ui" ? draftResponse.spec : undefined,
              css: draftResponse.kind === "css" ? draftResponse.css : undefined,
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Eval draft rendering failed.",
            },
          });
        }
        break;
      }

      case "readyToInject": {
        await renderUiIntoDocument(
          doc,
          response.extractor,
          response.spec,
          strategy,
          response.toolCallId,
          response.css,
        );
        return { injected: true, messages: response.messages };
      }

      case "readyToInjectCss": {
        appendHeadStyle(
          doc,
          response.css.css,
          `aui-agent-style-${response.toolCallId}`,
        );
        return { injected: true, messages: response.messages };
      }

      case "done":
        return {
          injected: false,
          messages: response.messages,
          reason: response.text,
        };

      case "error":
        throw new Error(response.error);
    }
  }

  return {
    injected: false,
    messages: lastMessages,
    reason: "Agent did not finish within maxAgentTurns.",
  };
}

function injectShadowTemplates(source: Element, clone: Element) {
  if (source.shadowRoot) {
    const template = clone.ownerDocument.createElement("template");
    template.setAttribute("shadowrootmode", "open");

    for (const child of Array.from(source.shadowRoot.childNodes)) {
      template.content.appendChild(child.cloneNode(true));
    }

    clone.appendChild(template);
  }

  const sourceChildren = Array.from(source.children);
  const cloneChildren = Array.from(clone.children).filter(
    (child) => !(child instanceof HTMLTemplateElement),
  );

  sourceChildren.forEach((sourceChild, index) => {
    const cloneChild = cloneChildren[index];
    if (cloneChild) {
      injectShadowTemplates(sourceChild, cloneChild);
    }
  });
}

export function serializeDocumentWithShadowRoots(doc: Document) {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  injectShadowTemplates(doc.documentElement, clone);

  const doctype = doc.doctype
    ? `<!DOCTYPE ${doc.doctype.name}>`
    : "<!DOCTYPE html>";

  return `${doctype}\n${clone.outerHTML}`;
}

function getJobId(filePath: string | undefined, index: number) {
  return filePath
    ? path.basename(filePath).replace(/\.[^.]+$/, "")
    : `eval-${index + 1}`;
}

async function readMaybeFile(value?: string, filePath?: string) {
  if (filePath) {
    return readFile(path.resolve(filePath), "utf8");
  }

  return value ?? "";
}

function parseCliArgs(argv: string[]) {
  const args: Record<string, string[]> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    const value = next && !next.startsWith("--") ? next : "true";
    args[key] = [...(args[key] ?? []), value];

    if (value !== "true") {
      index += 1;
    }
  }

  return args;
}

function buildConfigFromCli(base: EvalConfig): EvalConfig {
  const args = parseCliArgs(process.argv.slice(2));
  const inputs = args.input ?? args.html ?? [];
  const prompts = args.prompt ?? [];
  const promptFiles = args["prompt-file"] ?? [];
  const mode = (args.mode?.[0] as EvalMode | undefined) ?? base.mode;
  const outputDir = args["output-dir"]?.[0] ?? base.outputDir;
  const rootSelector = args.selector?.[0] ?? base.rootSelector;

  if (inputs.length === 0 && prompts.length === 0 && promptFiles.length === 0) {
    return { ...base, mode, outputDir, rootSelector };
  }

  const promptInputs = [...prompts, ...promptFiles.map((file) => `@${file}`)];
  const jobs = (inputs.length > 0 ? inputs : [undefined]).map(
    (inputPath, index) => {
      const promptInput =
        promptInputs.length === 1 ? promptInputs[0] : promptInputs[index];

      return {
        id: getJobId(inputPath, index),
        htmlPath: inputPath,
        prompt:
          promptInput && !promptInput.startsWith("@") ? promptInput : undefined,
        promptPath:
          promptInput && promptInput.startsWith("@")
            ? promptInput.slice(1)
            : undefined,
        mode,
        rootSelector,
      } satisfies EvalJobConfig;
    },
  );

  return { ...base, mode, outputDir, rootSelector, jobs };
}

async function loadJobs(config: EvalConfig): Promise<LoadedEvalJob[]> {
  return Promise.all(
    config.jobs.map(async (job, index) => {
      const html = await readMaybeFile(job.html, job.htmlPath);
      const prompt = await readMaybeFile(job.prompt, job.promptPath);
      const mode = job.mode ?? config.mode;

      return {
        id: job.id ?? getJobId(job.htmlPath, index),
        html: html || sampleHtml,
        prompt: mode === "auto" ? prompt || DEFAULT_AUTO_PROMPT : prompt,
        mode,
        rootSelector: job.rootSelector ?? config.rootSelector,
      };
    }),
  );
}

export async function reviseSample(
  html: string,
  prompt: string,
  strategy: RenderSystemId,
  ai: AIProvider,
  mode: EvalMode = prompt.trim() ? "prompt" : "auto",
) {
  const result = await runAgentEvalJob(
    {
      id: "sample",
      html,
      prompt,
      mode,
      rootSelector: EVAL_CONFIG.rootSelector,
    },
    ai,
    {
      ...EVAL_CONFIG,
      strategy,
    },
  );

  return result.html;
}

async function runAgentEvalJob(
  job: LoadedEvalJob,
  ai: AIProvider,
  config: EvalConfig,
) {
  const doc = createDocument(job.html);
  const selectedElement = makeSelectedElement(doc, job.rootSelector, job.id);
  const snapshot = inspectSelectedDomTree(selectedElement, doc);

  if (!snapshot) {
    throw new Error(`Unable to inspect DOM for job "${job.id}".`);
  }

  const agentMode: UiGenerationAgentMode =
    job.mode === "auto" ? "audit" : "revision";
  const prompt = job.mode === "auto" ? job.prompt || DEFAULT_AUTO_PROMPT : job.prompt;
  const basePayload = {
    prompt,
    mode: agentMode,
    source: "content" as const,
  };

  const initialResponse = await ai.runUiGenerationAgent({
    ...basePayload,
    snapshot,
    screenshot: createEvalScreenshot("Initial page", doc.documentElement.outerHTML),
  });

  const agentResult = await continueAgentOnDocument(
    ai,
    doc,
    initialResponse,
    basePayload,
    config.strategy,
    config,
  );

  return {
    id: job.id,
    injected: agentResult.injected,
    reason: agentResult.reason,
    html: serializeDocumentWithShadowRoots(doc),
  };
}

async function main() {
  const config = buildConfigFromCli(EVAL_CONFIG);
  const provider = new ClientAIProvider(process.env.OPENAI_API_KEY!);
  const jobs = await loadJobs(config);
  const results = [];

  for (const job of jobs) {
    const result = await runAgentEvalJob(job, provider, config);
    results.push(result);

    if (config.outputDir) {
      await mkdir(config.outputDir, { recursive: true });
      await writeFile(
        path.join(config.outputDir, `${result.id}.html`),
        result.html,
        "utf8",
      );
    } else {
      if (jobs.length > 1) {
        console.log(`<!-- eval result: ${result.id} -->`);
      }
      console.log(result.html);
    }
  }

  if (config.outputDir) {
    console.log(
      JSON.stringify(
        results.map(({ id, injected, reason }) => ({ id, injected, reason })),
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
