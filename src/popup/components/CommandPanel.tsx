import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";

import { discoverAndStoreSchema } from "../../schema/schema-service";
import { persistedAugmentationStore } from "../../storage/persisted-augmentation-store";
import { settingsStore } from "../../storage/settings-store";
import {
  clearUsabilityViolations as clearUsabilityViolationHighlights,
  createUiSpec,
  detectUsabilityIssues,
  getUsabilityDetectionContext,
  runUiGenerationAgent,
  showUsabilityViolations as showUsabilityViolationHighlights,
  submitAugmentationRequest,
} from "../../services/command-service";
import exampleViolationsSpec from "../../ai/prompts/example_violations.json";
import Example from "../../schema/dom-extraction-example.json";
// import Example from "@/schema/action.json";
// import Example from "../../schema/example.json";
import SpecExample from "../../schema/spec.json";
import type {
  AugmentationRequest,
  ExtensionSettings,
  PersistedAugmentation,
  SchemaDiscoveryResult,
  SelectedElement,
  UiGenerationAgentMode,
  UiGenerationAgentResponse,
  UsabilityGenerationTask,
  UsabilityViolation,
} from "../../types";
import type {
  DOMExtractorSpec,
  ExtractedValue,
} from "@/services/dom-extractor";
import { validateAndParse } from "@/services/dom-extractor";
import { useAugmentationEngine } from "@/content/use-augmentation-engine";
import { mapElementToSelectedElement } from "@/content/selection-state";
import { logger } from "@/utils/logger";
import {
  inspectSelectedDomTree,
  inspectSelectedMarkupContext,
  resolveSelectedElement,
  screenshotElement,
  withElementHidden,
  withElementsHidden,
} from "@/services/dom-inspection-service";
import { RenderSystemId } from "@/services/renderer/renderer";

interface CommandPanelProps {
  surface: "popup" | "sidepanel";
  onLoadingStateChange?: (enabled: boolean) => void;
  runWithUiHidden?: <T>(task: () => Promise<T>) => Promise<T>;
  mode?: "standalone" | "floating";
  previewVariant?: "full" | "prompt";
  pendingAugmentationId?: string | null;
  selectedElement?: SelectedElement | null;
  onPendingAugmentationChange?: (id: string | null) => void;
  usabilityGenerationQueue?: UsabilityGenerationTask[];
  activeUsabilityGenerationTaskId?: string | null;
  onUsabilityGenerationQueueChange?: (tasks: UsabilityGenerationTask[]) => void;
  onActiveUsabilityGenerationTaskIdChange?: (id: string | null) => void;
  onRequestClose?: () => void;
  onPreviewModeChange?: (enabled: boolean) => void;
}

type AugmentationStrategy = RenderSystemId;

interface RequestSettings {
  strategy: AugmentationStrategy;
  useUsabilityRules: boolean;
}

type GenerationStep =
  | { phase: "agent-audit" }
  | { phase: "agent-extractor" }
  | { phase: "agent-preview"; data?: Record<string, ExtractedValue> }
  | { phase: "agent-ui"; data?: Record<string, ExtractedValue> }
  | { phase: "extractor" }
  | { phase: "parsing"; data: Record<string, ExtractedValue> }
  | { phase: "ui"; data: Record<string, ExtractedValue> };

interface UsabilityReviewState {
  violations: UsabilityViolation[];
}

interface AgentWorkflowState {
  approvalId: string;
  messages: UiGenerationAgentResponse["messages"];
  violations: UsabilityViolation[];
}

interface ActiveAgentRequest {
  prompt: string;
  mode: UiGenerationAgentMode;
}

const STRATEGY_OPTIONS: {
  value: AugmentationStrategy;
  label: string;
  description: string;
  icon: string;
}[] = [
  // {
  //   value: "sample",
  //   label: "Sample",
  //   description: "Example data, no AI calls",
  //   icon: "📐",
  // },
  {
    value: "markup",
    label: "Markup Generation",
    description: "Generate HTML code",
    icon: "🤖",
  },
  // {
  //   value: "json-render",
  //   label: "Page update",
  //   description: "Create a new interface directly on the current page",
  //   icon: "🎨",
  // },
];

const USE_EXAMPLE_VIOLATIONS_FOR_ACKNOWLEDGEMENT = false;
const DEFAULT_AGENT_AUDIT_PROMPT = "Fix usability and design issues in the UI";

function isAncestorSelector(ancestor: string, descendant: string) {
  return ancestor !== descendant && descendant.startsWith(`${ancestor} > `);
}

function getSelectorDepth(selector: string) {
  return selector.split(" > ").length;
}

export function CommandPanel({
  surface,
  onLoadingStateChange,
  runWithUiHidden,
  mode = "standalone",
  previewVariant = "full",
  pendingAugmentationId: externalPendingAugmentationId = null,
  selectedElement = null,
  onPendingAugmentationChange,
  usabilityGenerationQueue: externalUsabilityGenerationQueue,
  activeUsabilityGenerationTaskId: externalActiveUsabilityGenerationTaskId,
  onUsabilityGenerationQueueChange,
  onActiveUsabilityGenerationTaskIdChange,
  onRequestClose,
  onPreviewModeChange,
}: CommandPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [persistedAugmentations, setPersistedAugmentations] = useState<
    PersistedAugmentation[]
  >([]);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [generationStep, setGenerationStep] = useState<GenerationStep | null>(
    null,
  );
  const [isDetectingUsability, setIsDetectingUsability] = useState(false);
  const [isCapturingUsabilityContext, setIsCapturingUsabilityContext] =
    useState(false);
  const [usabilityReview, setUsabilityReview] =
    useState<UsabilityReviewState | null>(null);
  const [agentWorkflow, setAgentWorkflow] =
    useState<AgentWorkflowState | null>(null);
  const [usabilityStatusMessage, setUsabilityStatusMessage] = useState<
    string | null
  >(null);
  const isBusy = generationStep !== null || isDetectingUsability;
  const [requestSettings, setRequestSettings] = useState<RequestSettings>({
    strategy: "markup",
    useUsabilityRules: false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [
    internalUsabilityGenerationQueue,
    setInternalUsabilityGenerationQueue,
  ] = useState<UsabilityGenerationTask[]>([]);
  const [
    internalActiveUsabilityGenerationTaskId,
    setInternalActiveUsabilityGenerationTaskId,
  ] = useState<string | null>(null);
  const submissionVersionRef = useRef(0);
  const activeAgentRequestRef = useRef<ActiveAgentRequest | null>(null);

  const isPopup = surface === "popup";
  const isFloating = mode === "floating";
  const augmentationEngine = useAugmentationEngine();
  const pendingAugmentationId = externalPendingAugmentationId;
  const usabilityGenerationQueue =
    externalUsabilityGenerationQueue ?? internalUsabilityGenerationQueue;
  const activeUsabilityGenerationTaskId =
    externalActiveUsabilityGenerationTaskId ??
    internalActiveUsabilityGenerationTaskId;
  const isPreviewMode = Boolean(pendingAugmentationId);

  function updatePendingAugmentationId(id: string | null) {
    onPendingAugmentationChange?.(id);
  }

  function updateUsabilityGenerationQueue(tasks: UsabilityGenerationTask[]) {
    onUsabilityGenerationQueueChange?.(tasks);
    if (!onUsabilityGenerationQueueChange) {
      setInternalUsabilityGenerationQueue(tasks);
    }
  }

  function updateActiveUsabilityGenerationTaskId(id: string | null) {
    onActiveUsabilityGenerationTaskIdChange?.(id);
    if (!onActiveUsabilityGenerationTaskIdChange) {
      setInternalActiveUsabilityGenerationTaskId(id);
    }
  }

  async function refreshPersistedAugmentations() {
    const storedAugmentations = await persistedAugmentationStore.list();
    setPersistedAugmentations(storedAugmentations);
  }

  async function captureSelectedElementScreenshot(
    requestSelectedElement: SelectedElement | null,
  ) {
    if (!requestSelectedElement) {
      return "";
    }

    const selectedDomElement = resolveSelectedElement(requestSelectedElement);

    if (!selectedDomElement) {
      return "";
    }

    const floatingPopupHost = document
      .querySelector("ai-ui-floating-popup")
      ?.shadowRoot?.querySelector("#aui-popup");
    const overlays = document.querySelectorAll("[data-aui-overlay=true]");

    return floatingPopupHost
      ? await withElementsHidden([floatingPopupHost, ...overlays], () =>
          screenshotElement(selectedDomElement),
        )
      : await screenshotElement(selectedDomElement);
  }

  useEffect(() => {
    void (async () => {
      const [storedAugmentations, storedSettings] = await Promise.all([
        persistedAugmentationStore.list(),
        settingsStore.get(),
      ]);

      setPersistedAugmentations(storedAugmentations);
      setSettings(storedSettings);
      setPrompt(storedSettings.lastCommand ?? "");
    })();
  }, []);

  useEffect(() => {
    onPreviewModeChange?.(isPreviewMode);
  }, [isPreviewMode, onPreviewModeChange]);

  useEffect(() => {
    onLoadingStateChange?.(
      generationStep !== null ||
        (isDetectingUsability && !isCapturingUsabilityContext),
    );
  }, [
    generationStep,
    isCapturingUsabilityContext,
    isDetectingUsability,
    onLoadingStateChange,
  ]);

  useEffect(() => {
    return () => {
      void clearUsabilityViolationHighlights();
    };
  }, []);

  useEffect(() => {
    if (!augmentationEngine || !pendingAugmentationId) {
      augmentationEngine?.clearHighlightedAugmentation();
      return;
    }

    augmentationEngine.highlightAugmentation(pendingAugmentationId);

    return () => {
      augmentationEngine.clearHighlightedAugmentation();
    };
  }, [augmentationEngine, pendingAugmentationId]);

  async function runGenerationPipeline(
    requestPrompt: string,
    requestSelectedElement: SelectedElement | null,
  ) {
    if (!requestPrompt.trim()) {
      return false;
    }

    const screenshot =
      await captureSelectedElementScreenshot(requestSelectedElement);

    const submissionVersion = submissionVersionRef.current + 1;
    submissionVersionRef.current = submissionVersion;
    setGenerationStep({ phase: "extractor" });

    try {
      console.log(screenshot);

      const extractor = await submitAugmentationRequest(
        requestPrompt,
        surface,
        {
          selectedElement: requestSelectedElement,
        },
      );

      if (submissionVersion !== submissionVersionRef.current) {
        return false;
      }

      if (!extractor) {
        return false;
      }

      const parsed = validateAndParse(extractor);

      if (!parsed.data) {
        logger.warn(
          "Skipping UI spec generation because extractor parsing failed.",
          {
            errors: parsed.errors,
          },
        );
        return false;
      }

      setGenerationStep({ phase: "ui", data: parsed.data });
      const uiSpecString = await createUiSpec(
        requestPrompt,
        surface,
        screenshot,
        {
          selectedElement: requestSelectedElement,
          data: parsed.data,
          strategy: requestSettings.strategy,
        },
      );

      if (submissionVersion !== submissionVersionRef.current) {
        return false;
      }

      logger.info("Generated UI spec.", uiSpecString);

      if (!uiSpecString || !augmentationEngine) {
        return false;
      }

      const injectedAugmentation = await augmentationEngine.inject(
        extractor,
        uiSpecString,
        requestSettings.strategy,
      );

      if (submissionVersion !== submissionVersionRef.current) {
        return false;
      }

      updatePendingAugmentationId(injectedAugmentation?.id ?? null);
      void disableSelectionModeIfEnabled();
      return Boolean(injectedAugmentation?.id);
    } finally {
      if (submissionVersion === submissionVersionRef.current) {
        setGenerationStep(null);
      }
    }
  }

  async function getAgentDetectionContext() {
    if (runWithUiHidden) {
      setIsCapturingUsabilityContext(true);

      try {
        return await runWithUiHidden(() => getUsabilityDetectionContext());
      } finally {
        setIsCapturingUsabilityContext(false);
      }
    }

    return getUsabilityDetectionContext();
  }

  function getAgentRequest(): ActiveAgentRequest {
    const trimmedPrompt = prompt.trim();

    return {
      prompt: trimmedPrompt || DEFAULT_AGENT_AUDIT_PROMPT,
      mode: trimmedPrompt ? "revision" : "audit",
    };
  }

  function getActiveAgentRequest(): ActiveAgentRequest {
    return activeAgentRequestRef.current ?? getAgentRequest();
  }

  async function renderDraftAndCaptureScreenshot(
    extractor: DOMExtractorSpec,
    spec: string,
  ) {
    if (!augmentationEngine) {
      throw new Error("The augmentation engine was not available.");
    }

    return augmentationEngine.renderDraftForScreenshot(
      extractor,
      spec,
      "markup",
      (element) =>
        runWithUiHidden
          ? runWithUiHidden(() => screenshotElement(element, { quality: 0.92 }))
          : screenshotElement(element, { quality: 0.92 }),
    );
  }

  async function continueAgentResponse(
    initialResponse: UiGenerationAgentResponse | null,
    submissionVersion: number,
  ) {
    let response = initialResponse;
    let iterationCount = 0;

    while (response && iterationCount < 8) {
      iterationCount += 1;

      if (submissionVersion !== submissionVersionRef.current) {
        return false;
      }

      switch (response.status) {
        case "needsApproval": {
          setAgentWorkflow({
            approvalId: response.approvalId,
            messages: response.messages,
            violations: response.violations,
          });
          setUsabilityReview({ violations: response.violations });
          await showUsabilityViolationHighlights(response.violations);
          setGenerationStep(null);
          return false;
        }
        case "needsExtractorResult": {
          setGenerationStep({ phase: "agent-extractor" });
          const parsed = validateAndParse(response.extractor);

          if (!parsed.data) {
            response = await runUiGenerationAgent({
              ...getActiveAgentRequest(),
              source: surface,
              messages: response.messages,
              extractorResult: {
                toolCallId: response.toolCallId,
                extractor: response.extractor,
                valid: false,
                errors: parsed.errors,
              },
            });
            continue;
          }

          const rootSelectedElement =
            parsed.root instanceof HTMLElement
              ? mapElementToSelectedElement(parsed.root)
              : null;

          const [rootScreenshot, rootSnapshot, markupContext] =
            rootSelectedElement
              ? await Promise.all([
                  captureSelectedElementScreenshot(rootSelectedElement),
                  Promise.resolve(
                    inspectSelectedDomTree(rootSelectedElement) ?? undefined,
                  ),
                  Promise.resolve(
                    inspectSelectedMarkupContext(rootSelectedElement) ??
                      undefined,
                  ),
                ])
              : ["", undefined, undefined];

          setGenerationStep({ phase: "agent-preview", data: parsed.data });

          response = await runUiGenerationAgent({
            ...getActiveAgentRequest(),
            source: surface,
            messages: response.messages,
            extractorResult: {
              toolCallId: response.toolCallId,
              extractor: response.extractor,
              valid: true,
              data: parsed.data,
              snapshot: rootSnapshot,
              markupContext,
              screenshot: rootScreenshot,
            },
          });
          continue;
        }
        case "needsDraftRender": {
          const draftRenderRequest = response;
          const parsed = validateAndParse(draftRenderRequest.extractor);
          setGenerationStep({
            phase: "agent-preview",
            data: parsed.data ?? undefined,
          });

          try {
            const screenshot = await renderDraftAndCaptureScreenshot(
              draftRenderRequest.extractor,
              draftRenderRequest.spec,
            );

            response = await runUiGenerationAgent({
              ...getActiveAgentRequest(),
              source: surface,
              messages: draftRenderRequest.messages,
              draftRenderResult: {
                toolCallId: draftRenderRequest.toolCallId,
                extractor: draftRenderRequest.extractor,
                spec: draftRenderRequest.spec,
                success: true,
                screenshot,
              },
            });
          } catch (error) {
            response = await runUiGenerationAgent({
              ...getActiveAgentRequest(),
              source: surface,
              messages: draftRenderRequest.messages,
              draftRenderResult: {
                toolCallId: draftRenderRequest.toolCallId,
                extractor: draftRenderRequest.extractor,
                spec: draftRenderRequest.spec,
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Draft rendering failed.",
              },
            });
          }

          continue;
        }
        case "readyToInject": {
          setGenerationStep({ phase: "agent-ui" });

          if (!augmentationEngine) {
            setUsabilityStatusMessage(
              "The agent finished, but the augmentation engine was not available.",
            );
            setGenerationStep(null);
            return false;
          }

          const injectedAugmentation = await augmentationEngine.inject(
            response.extractor,
            response.spec,
            "markup",
          );

          if (submissionVersion !== submissionVersionRef.current) {
            return false;
          }

          updatePendingAugmentationId(injectedAugmentation?.id ?? null);
          void disableSelectionModeIfEnabled();
          setAgentWorkflow(null);
          activeAgentRequestRef.current = null;
          setGenerationStep(null);
          return Boolean(injectedAugmentation?.id);
        }
        case "done": {
          setUsabilityStatusMessage(response.text || "The agent finished.");
          setAgentWorkflow(null);
          activeAgentRequestRef.current = null;
          setGenerationStep(null);
          return false;
        }
        case "error": {
          logger.error("UI generation agent failed.", response.error);
          setUsabilityStatusMessage(response.error);
          setAgentWorkflow(null);
          activeAgentRequestRef.current = null;
          setGenerationStep(null);
          return false;
        }
      }
    }

    setUsabilityStatusMessage("The agent stopped before producing a preview.");
    setAgentWorkflow(null);
    activeAgentRequestRef.current = null;
    setGenerationStep(null);
    return false;
  }

  async function handleRunAgentWorkflow() {
    await clearUsabilityReview();
    setAgentWorkflow(null);

    const submissionVersion = submissionVersionRef.current + 1;
    submissionVersionRef.current = submissionVersion;
    const agentRequest = getAgentRequest();
    activeAgentRequestRef.current = agentRequest;
    setGenerationStep({
      phase: agentRequest.mode === "audit" ? "agent-audit" : "agent-extractor",
    });

    try {
      const context = await getAgentDetectionContext();

      if (!context) {
        setUsabilityStatusMessage(
          "The agent could not inspect the current page.",
        );
        return false;
      }

      const response = await runUiGenerationAgent({
        ...agentRequest,
        source: surface,
        snapshot: context.snapshot,
        screenshot: context.screenshot,
      });

      return await continueAgentResponse(response, submissionVersion);
    } catch (error) {
      logger.error("Failed to run UI generation agent.", error);
      setUsabilityStatusMessage(
        error instanceof Error ? error.message : "The agent workflow failed.",
      );
      return false;
    } finally {
      if (submissionVersion === submissionVersionRef.current) {
        setIsCapturingUsabilityContext(false);
        setGenerationStep(null);
      }
    }
  }

  async function continueAgentAfterApproval() {
    if (!agentWorkflow) {
      return;
    }

    const activeAgentWorkflow = agentWorkflow;
    const submissionVersion = submissionVersionRef.current + 1;
    submissionVersionRef.current = submissionVersion;

    setAgentWorkflow(null);
    setUsabilityReview(null);
    setUsabilityStatusMessage(null);
    await clearUsabilityViolationHighlights();
    setGenerationStep({ phase: "agent-extractor" });

    try {
      const response = await runUiGenerationAgent({
        ...getActiveAgentRequest(),
        source: surface,
        messages: activeAgentWorkflow.messages,
        approval: {
          approvalId: activeAgentWorkflow.approvalId,
          approved: true,
          reason: "User approved the reported UI issues.",
        },
      });

      await continueAgentResponse(response, submissionVersion);
    } catch (error) {
      logger.error("Failed to continue UI generation agent.", error);
      setUsabilityStatusMessage(
        error instanceof Error
          ? error.message
          : "The agent workflow could not continue.",
      );
    } finally {
      if (submissionVersion === submissionVersionRef.current) {
        setGenerationStep(null);
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!prompt.trim()) {
      return;
    }

    await clearUsabilityReview();
    setAgentWorkflow(null);
    await runGenerationPipeline(prompt, selectedElement);
  }

  function handleCancelLoading() {
    submissionVersionRef.current += 1;
    setGenerationStep(null);
    setAgentWorkflow(null);
    activeAgentRequestRef.current = null;
    updateUsabilityGenerationQueue([]);
    updateActiveUsabilityGenerationTaskId(null);
  }

  async function acknowledgeDetectedViolations(
    violations: UsabilityViolation[],
  ) {
    const queuedTasks = buildUsabilityGenerationTasks(
      getViolationsForAcknowledgement(violations),
    );

    updateUsabilityGenerationQueue(queuedTasks);
    updateActiveUsabilityGenerationTaskId(null);

    if (queuedTasks.length === 0) {
      setUsabilityStatusMessage(
        "No matching page sections were found for the selected usability issues.",
      );
    }
  }

  async function clearUsabilityReview() {
    setUsabilityReview(null);
    setUsabilityStatusMessage(null);
    await clearUsabilityViolationHighlights();
  }

  function getViolationsForAcknowledgement(
    detectedViolations: UsabilityViolation[],
  ) {
    return USE_EXAMPLE_VIOLATIONS_FOR_ACKNOWLEDGEMENT
      ? (exampleViolationsSpec.violations as UsabilityViolation[])
      : detectedViolations;
  }

  async function getViolationsForReview() {
    if (USE_EXAMPLE_VIOLATIONS_FOR_ACKNOWLEDGEMENT) {
      return exampleViolationsSpec.violations as UsabilityViolation[];
    }

    return detectUsabilityIssues(surface, requestSettings.useUsabilityRules);
  }

  function buildUsabilityGenerationPrompt(violations: UsabilityViolation[]) {
    return [
      "Update the selected section to resolve these usability issues:",
      ...violations.map(
        (violation, index) => `${index + 1}. ${violation.resolutionPrompt}`,
      ),
    ].join("\n");
  }

  function buildUsabilityGenerationTasks(
    violations: UsabilityViolation[],
  ): UsabilityGenerationTask[] {
    const sortedViolations = [...violations].sort(
      (a, b) => getSelectorDepth(a.selector) - getSelectorDepth(b.selector),
    );
    const rootViolations = sortedViolations.filter(
      (candidate) =>
        !sortedViolations.some((other) =>
          isAncestorSelector(other.selector, candidate.selector),
        ),
    );

    return rootViolations.flatMap((rootViolation) => {
      const groupedViolations = sortedViolations.filter(
        (candidate) =>
          candidate.selector === rootViolation.selector ||
          isAncestorSelector(rootViolation.selector, candidate.selector),
      );

      let element: HTMLElement | null = null;

      try {
        element = document.querySelector<HTMLElement>(rootViolation.selector);
      } catch {
        element = null;
      }

      if (!element) {
        logger.warn(
          "Skipping usability generation task because selector did not resolve.",
          {
            selector: rootViolation.selector,
          },
        );
        return [];
      }

      return [
        {
          id: crypto.randomUUID(),
          rootViolation,
          violations: groupedViolations,
          selectedElement: mapElementToSelectedElement(element),
          prompt: buildUsabilityGenerationPrompt(groupedViolations),
        },
      ];
    });
  }

  function completeActiveUsabilityGenerationTask() {
    if (!activeUsabilityGenerationTaskId) {
      return;
    }

    const nextQueue = usabilityGenerationQueue.filter(
      (task) => task.id !== activeUsabilityGenerationTaskId,
    );
    updateUsabilityGenerationQueue(nextQueue);
    updateActiveUsabilityGenerationTaskId(null);
  }

  async function showDetectedViolations(
    violations: UsabilityViolation[],
    options: {
      skipAcknowledgement?: boolean;
    } = {},
  ) {
    if (options.skipAcknowledgement) {
      await acknowledgeDetectedViolations(violations);
      return;
    }

    setUsabilityReview({ violations });
    await showUsabilityViolationHighlights(violations);
  }

  async function handleDetectUsabilityIssues(options?: {
    skipAcknowledgement?: boolean;
  }) {
    setIsDetectingUsability(true);
    await clearUsabilityReview();
    setAgentWorkflow(null);

    try {
      const violations = USE_EXAMPLE_VIOLATIONS_FOR_ACKNOWLEDGEMENT
        ? await getViolationsForReview()
        : await (async () => {
            let context = null;

            if (runWithUiHidden) {
              setIsCapturingUsabilityContext(true);

              try {
                context = await runWithUiHidden(() =>
                  getUsabilityDetectionContext(),
                );
              } finally {
                setIsCapturingUsabilityContext(false);
              }
            }

            return detectUsabilityIssues(
              surface,
              requestSettings.useUsabilityRules,
              context ?? undefined,
            );
          })();

      if (violations.length === 0) {
        setUsabilityStatusMessage(
          "No clear usability issues were detected on the page.",
        );
        return;
      }

      await showDetectedViolations(violations, options);
    } finally {
      setIsCapturingUsabilityContext(false);
      setIsDetectingUsability(false);
    }
  }

  async function handleAcknowledgeUsabilityIssues() {
    if (agentWorkflow) {
      await continueAgentAfterApproval();
      return;
    }

    if (!usabilityReview) {
      return;
    }

    await acknowledgeDetectedViolations(usabilityReview.violations);
    await clearUsabilityReview();
  }

  async function handleCancelUsabilityIssues() {
    setAgentWorkflow(null);
    activeAgentRequestRef.current = null;
    await clearUsabilityReview();
  }

  async function handleConfirmAugmentation() {
    if (!augmentationEngine || !pendingAugmentationId) return;

    await augmentationEngine.persistAugmentation(pendingAugmentationId);
    await refreshPersistedAugmentations();
    updatePendingAugmentationId(null);
    completeActiveUsabilityGenerationTask();
  }

  async function handleDeletePreviewAugmentation() {
    if (!augmentationEngine || !pendingAugmentationId) return;

    augmentationEngine.remove(pendingAugmentationId);
    updatePendingAugmentationId(null);
    completeActiveUsabilityGenerationTask();
  }

  async function handlePersistedToggle(augmentation: PersistedAugmentation) {
    const nextEnabled = !augmentation.enabled;
    await persistedAugmentationStore.setEnabled(augmentation.id, nextEnabled);

    if (augmentationEngine) {
      if (nextEnabled) {
        await augmentationEngine.injectPersistedAugmentations();
      } else {
        augmentationEngine.remove(augmentation.id);
      }
    }

    await refreshPersistedAugmentations();
  }

  async function handlePersistedDelete(augmentation: PersistedAugmentation) {
    await persistedAugmentationStore.remove(augmentation.id);
    augmentationEngine?.remove(augmentation.id);

    if (pendingAugmentationId === augmentation.id) {
      updatePendingAugmentationId(null);
    }

    await refreshPersistedAugmentations();
  }

  async function handleSettingsToggle(
    key: "selectionModeEnabled" | "injectDemoCardOnLoad",
  ) {
    if (!settings) return;
    const nextSettings = await settingsStore.patch({ [key]: !settings[key] });
    setSettings(nextSettings);
  }

  async function disableSelectionModeIfEnabled() {
    if (!settings?.selectionModeEnabled) {
      return;
    }

    const nextSettings = await settingsStore.patch({
      selectionModeEnabled: false,
    });
    setSettings(nextSettings);
  }

  useEffect(() => {
    if (previewVariant !== "full") {
      return;
    }

    if (
      pendingAugmentationId ||
      generationStep ||
      isDetectingUsability ||
      activeUsabilityGenerationTaskId ||
      usabilityGenerationQueue.length === 0
    ) {
      return;
    }

    const nextTask = usabilityGenerationQueue[0];

    updateActiveUsabilityGenerationTaskId(nextTask.id);

    void (async () => {
      const generated = await runGenerationPipeline(
        nextTask.prompt,
        nextTask.selectedElement,
      );

      if (!generated) {
        const nextQueue = usabilityGenerationQueue.filter(
          (task) => task.id !== nextTask.id,
        );
        updateUsabilityGenerationQueue(nextQueue);
        updateActiveUsabilityGenerationTaskId(null);
        setUsabilityStatusMessage(
          `Skipped a usability update for ${nextTask.rootViolation.selector}.`,
        );
      }
    })();
  }, [
    activeUsabilityGenerationTaskId,
    generationStep,
    isDetectingUsability,
    pendingAugmentationId,
    previewVariant,
    usabilityGenerationQueue,
  ]);

  const shellClassName = isPopup
    ? "min-h-screen w-full min-w-[320px]"
    : "min-h-screen w-full min-w-[320px] max-w-4xl";

  const wrapperClassName = isFloating
    ? "w-full min-w-[280px] bg-transparent p-0"
    : `bg-stone-100 text-slate-900 ${shellClassName} bg-[radial-gradient(circle_at_top_left,_rgba(254,240,138,0.28),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(125,211,252,0.22),_transparent_36%)] p-4`;

  if (previewVariant === "prompt" && isPreviewMode) {
    return (
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="grid gap-0.5 pl-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500">
            Review
          </span>
          <span className="text-sm font-medium text-white">
            Keep this page update?
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-emerald-500 cursor-pointer"
            type="button"
            onClick={() => void handleConfirmAugmentation()}
          >
            Save
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full bg-rose-100 px-4 py-2 text-sm font-medium text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-200 cursor-pointer"
            type="button"
            onClick={() => void handleDeletePreviewAugmentation()}
          >
            Discard
          </button>
        </div>
      </div>
    );
  }

  if (generationStep) {
    const isAgentStep = generationStep.phase.startsWith("agent-");
    const steps: {
      phase: GenerationStep["phase"];
      label: string;
      detail: string;
    }[] = isAgentStep
      ? [
          {
            phase: "agent-audit",
            label: "Auditing the page",
            detail:
              "Reviewing the screenshot and DOM for usability issues to fix.",
          },
          {
            phase: "agent-extractor",
            label: "Reading live data",
            detail:
              "Creating and validating the extractor for the replacement section.",
          },
          {
            phase: "agent-preview",
            label: "Previewing the draft",
            detail:
              "Rendering the draft on the page and capturing it for the agent to revise.",
          },
          {
            phase: "agent-ui",
            label: "Preparing the preview",
            detail:
              "Submitting the revised fragment for preview on the page.",
          },
        ]
      : [
          {
            phase: "extractor",
            label: "Reading the page",
            detail:
              "Understanding the current page structure and identifying the right data to use.",
          },
          {
            phase: "ui",
            label: "Designing the view",
            detail:
              "Building the interface and preparing it for preview on the page.",
          },
        ];

    const currentIndex = steps.findIndex(
      (s) => s.phase === generationStep.phase,
    );
    const data = "data" in generationStep ? generationStep.data : null;

    return (
      <div className={wrapperClassName}>
        <div
          className={`grid gap-5 ${
            isFloating
              ? "rounded-b-[28px] bg-white/95 p-5"
              : "rounded-[28px] border border-slate-900/10 bg-white/80 p-5 shadow-[0_18px_40px_rgba(50,50,93,0.08)] backdrop-blur-sm"
          }`}
        >
          {/* Header */}
          <div className="grid gap-1 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-sky-100 border-t-sky-500" />
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
              {isAgentStep ? "Agent is working" : "Preparing your preview"}
            </h1>
          </div>

          {/* Steps */}
          <ol className="grid gap-2">
            {steps.map((step, i) => {
              const isDone = i < currentIndex;
              const isActive = i === currentIndex;

              return (
                <li
                  key={step.phase}
                  className={`flex items-start gap-3 rounded-2xl border p-3 transition-colors ${
                    isActive
                      ? "border-sky-200 bg-sky-50"
                      : isDone
                        ? "border-emerald-100 bg-emerald-50/60"
                        : "border-slate-100 bg-slate-50/60 opacity-40"
                  }`}
                >
                  <span className="mt-0.5 text-base leading-none">
                    {isDone ? "✅" : isActive ? "⏳" : "○"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold ${
                        isActive
                          ? "text-sky-800"
                          : isDone
                            ? "text-emerald-800"
                            : "text-slate-400"
                      }`}
                    >
                      {step.label}
                    </p>
                    {isActive && (
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                        {step.detail}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Extracted data preview */}
          {data && (
            <div className="grid gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Page Data
              </p>
              <pre className="max-h-48 overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-3 text-[11px] leading-5 text-emerald-400 shadow-inner">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}

          {/* Cancel */}
          <div className="flex justify-center">
            <button
              className="inline-flex items-center justify-center rounded-full bg-rose-100 px-4 py-2 text-sm font-medium text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-200 cursor-pointer"
              type="button"
              onClick={handleCancelLoading}
            >
              Stop
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      <div
        className={`grid gap-4 ${
          isFloating
            ? "rounded-b-[28px] bg-white/95 p-5"
            : "rounded-[28px] border border-slate-900/10 bg-white/80 p-5 shadow-[0_18px_40px_rgba(50,50,93,0.08)] backdrop-blur-sm"
        }`}
      >
        <header className="grid gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
            Live Preview Studio
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Shape this page with a prompt
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Describe what you want to see, preview it on the page, and save the
            versions you want to keep.
          </p>
        </header>

        {/* ── Selection mode ── */}
        <div
          className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition hover:-translate-y-0.5 ${
            settings?.selectionModeEnabled
              ? "border-sky-300 bg-sky-50 shadow-sm"
              : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
          }`}
          onClick={() => void handleSettingsToggle("selectionModeEnabled")}
        >
          <span className="text-xl">🖱️</span>
          <div className="min-w-0 flex-1">
            <p
              className={`text-xs font-semibold ${settings?.selectionModeEnabled ? "text-sky-800" : "text-slate-700"}`}
            >
              Choose a target area
            </p>
            <p
              className={`text-[11px] leading-4 ${settings?.selectionModeEnabled ? "text-sky-600" : "text-slate-500"}`}
            >
              {settings?.selectionModeEnabled
                ? "On — click any part of the page to aim this request"
                : "Off — turn this on to pick a specific part of the page"}
            </p>
          </div>
          <div
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              settings?.selectionModeEnabled
                ? "bg-sky-200 text-sky-800"
                : "bg-slate-200 text-slate-500"
            }`}
          >
            {settings?.selectionModeEnabled ? "On" : "Off"}
          </div>
        </div>

        {/* ── Selected element ── */}
        {selectedElement ? (
          <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
              Selected area
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {selectedElement.selector}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">
              {selectedElement.textPreview || "No preview text available yet."}
            </p>
          </div>
        ) : null}

        {/* ── Prompt form ── */}
        <form className="grid gap-2" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-xs font-semibold tracking-wide text-slate-700">
              What would you like to change?
            </span>
            <textarea
              className="min-h-32 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-sky-100"
              placeholder="Example: Add a compact summary panel beside the selected section."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>

          {/* ── Request settings ── */}
          <Collapsible.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
            <Collapsible.Trigger className="flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left transition hover:bg-slate-100">
              <span
                className={`text-[11px] transition-transform duration-200 ${settingsOpen ? "rotate-90" : ""}`}
              >
                ▶
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Generation options
              </span>
              {/* Active summary pill shown when collapsed */}
              {!settingsOpen && (
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {
                    STRATEGY_OPTIONS.find(
                      (o) => o.value === requestSettings.strategy,
                    )?.label
                  }
                </span>
              )}
            </Collapsible.Trigger>

            <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-none">
              <div className="grid gap-3 pt-2">
                {/* Strategy picker */}
                <div className="grid gap-1.5">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Creation mode
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {STRATEGY_OPTIONS.map((option) => {
                      const active = requestSettings.strategy === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setRequestSettings((prev) => ({
                              ...prev,
                              strategy: option.value,
                            }))
                          }
                          className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition hover:-translate-y-0.5 cursor-pointer ${
                            active
                              ? "border-slate-800 bg-slate-950 shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <span className="text-base">{option.icon}</span>
                          <span
                            className={`text-xs font-semibold ${active ? "text-white" : "text-slate-700"}`}
                          >
                            {option.label}
                          </span>
                          <span
                            className={`text-[11px] leading-4 ${active ? "text-slate-400" : "text-slate-500"}`}
                          >
                            {option.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Usability detection
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setRequestSettings((prev) => ({
                        ...prev,
                        useUsabilityRules: !prev.useUsabilityRules,
                      }))
                    }
                    className={`flex items-center justify-between rounded-xl border p-3 text-left transition hover:-translate-y-0.5 cursor-pointer ${
                      requestSettings.useUsabilityRules
                        ? "border-amber-300 bg-amber-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-semibold ${
                          requestSettings.useUsabilityRules
                            ? "text-amber-900"
                            : "text-slate-700"
                        }`}
                      >
                        Use current rules
                      </p>
                      <p
                        className={`text-[11px] leading-4 ${
                          requestSettings.useUsabilityRules
                            ? "text-amber-700"
                            : "text-slate-500"
                        }`}
                      >
                        {requestSettings.useUsabilityRules
                          ? "On — detections follow the current usability rule set"
                          : "Off — detections can flag any usability issue they find"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                        requestSettings.useUsabilityRules
                          ? "bg-amber-200 text-amber-900"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {requestSettings.useUsabilityRules ? "On" : "Off"}
                    </span>
                  </button>
                </div>
              </div>
            </Collapsible.Content>
          </Collapsible.Root>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:opacity-60 cursor-pointer"
              type="submit"
              disabled={isBusy}
            >
              {generationStep ? "Building..." : "Generate"}
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-violet-100 px-4 py-2 text-sm font-medium text-violet-900 transition hover:-translate-y-0.5 hover:bg-violet-200 disabled:translate-y-0 disabled:opacity-60 cursor-pointer"
              type="button"
              disabled={isBusy}
              onClick={() => void handleRunAgentWorkflow()}
            >
              Agent Flow
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 transition hover:-translate-y-0.5 hover:bg-amber-200 disabled:translate-y-0 disabled:opacity-60 cursor-pointer"
              type="button"
              disabled={isBusy}
              onClick={() => void handleDetectUsabilityIssues()}
            >
              {isDetectingUsability ? "Checking..." : "Detect Issues"}
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-sky-100 px-4 py-2 text-sm font-medium text-slate-800 transition hover:-translate-y-0.5 hover:bg-sky-200 cursor-pointer"
              type="button"
              onClick={() => setPrompt("")}
            >
              Reset
            </button>
          </div>
        </form>

        {usabilityStatusMessage ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3">
            <p className="text-sm font-medium text-emerald-900">
              {usabilityStatusMessage}
            </p>
          </div>
        ) : null}

        {usabilityReview ? (
          <section className="grid gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                  {agentWorkflow ? "Agent Review" : "Usability Review"}
                </p>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  Highlighted issues on the page
                </h2>
              </div>
              <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-rose-200 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-rose-900">
                {usabilityReview.violations.length}
              </span>
            </div>

            <p className="text-sm leading-6 text-slate-600">
              {agentWorkflow
                ? "Approve these findings to let the agent generate and preview the replacement UI."
                : "Hover the page highlights to inspect each violation, then acknowledge or cancel this review."}
            </p>

            <div className="grid max-h-48 gap-2 overflow-auto">
              {usabilityReview.violations.map((violation, index) => (
                <article
                  key={`${violation.ruleId}-${violation.selector}-${index}`}
                  className="grid gap-1 rounded-2xl border border-rose-100 bg-white/80 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {violation.description}
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-600">
                        {violation.resolutionPrompt}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                      {violation.ruleId}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-slate-500">
                    {violation.selector}
                  </p>
                </article>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center justify-center rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-rose-500 cursor-pointer"
                type="button"
                onClick={() => void handleAcknowledgeUsabilityIssues()}
              >
                {agentWorkflow ? "Approve" : "Acknowledge"}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 cursor-pointer"
                type="button"
                onClick={() => void handleCancelUsabilityIssues()}
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        {/* ── Saved enhancements ── */}
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Saved versions
            </h2>
            <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">
              {persistedAugmentations.length}
            </span>
          </div>

          <div className="grid max-h-56 gap-2 overflow-auto">
            {persistedAugmentations.length === 0 ? (
              <div className="rounded-2xl border border-slate-900/8 bg-slate-50/80 p-4">
                <p className="text-sm leading-6 text-slate-600">
                  No saved versions yet. Generate a preview above and save the
                  ones you want to keep.
                </p>
              </div>
            ) : (
              persistedAugmentations.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-2 rounded-2xl border border-sky-100 bg-sky-50/70 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {item.label}
                      </p>
                      <span className="text-xs text-slate-500">
                        {new Date(item.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5 cursor-pointer ${
                          item.enabled
                            ? "bg-sky-200 text-sky-900 hover:bg-sky-300"
                            : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                        }`}
                        type="button"
                        onClick={() => void handlePersistedToggle(item)}
                      >
                        {item.enabled ? "Hide" : "Show"}
                      </button>
                      <button
                        className="inline-flex items-center justify-center rounded-full bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-200 cursor-pointer"
                        type="button"
                        onClick={() => void handlePersistedDelete(item)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {item.extractor.root.selector || item.pageUrl}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
