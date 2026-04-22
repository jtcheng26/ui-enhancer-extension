import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";

import { discoverAndStoreSchema } from "../../schema/schema-service";
import { persistedAugmentationStore } from "../../storage/persisted-augmentation-store";
import { settingsStore } from "../../storage/settings-store";
import {
  createUiSpec,
  submitAugmentationRequest,
} from "../../services/command-service";
import Example from "../../schema/dom-extraction-example.json";
// import Example from "../../schema/example.json";
import SpecExample from "../../schema/spec.json";
import type {
  AugmentationRequest,
  ExtensionSettings,
  PersistedAugmentation,
  SchemaDiscoveryResult,
  SelectedElement,
} from "../../types";
import type {
  DOMExtractorSpec,
  ExtractedValue,
} from "@/services/dom-extractor";
import { validateAndParse } from "@/services/dom-extractor";
import { useAugmentationEngine } from "@/content/use-augmentation-engine";
import { logger } from "@/utils/logger";
import {
  resolveSelectedElement,
  screenshotElement,
  withElementHidden,
} from "@/services/dom-inspection-service";
import { RENDER_SYSTEMS, RenderSystemId } from "@/services/renderer/renderer";

interface CommandPanelProps {
  surface: "popup" | "sidepanel";
  onLoadingStateChange?: (enabled: boolean) => void;
  mode?: "standalone" | "floating";
  previewVariant?: "full" | "prompt";
  pendingAugmentationId?: string | null;
  selectedElement?: SelectedElement | null;
  onPendingAugmentationChange?: (id: string | null) => void;
  onRequestClose?: () => void;
  onPreviewModeChange?: (enabled: boolean) => void;
}

type AugmentationStrategy = RenderSystemId;

interface RequestSettings {
  strategy: AugmentationStrategy;
}

type GenerationStep =
  | { phase: "extractor" }
  | { phase: "parsing"; data: Record<string, ExtractedValue> }
  | { phase: "ui"; data: Record<string, ExtractedValue> };

const STRATEGY_OPTIONS: {
  value: AugmentationStrategy;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "sample",
    label: "Sample",
    description: "Example data, no AI calls",
    icon: "📐",
  },
  {
    value: "markup",
    label: "Markup Generation",
    description: "Generate HTML code",
    icon: "🤖",
  },
  {
    value: "json-render",
    label: "Page update",
    description: "Create a new interface directly on the current page",
    icon: "🎨",
  },
];

export function CommandPanel({
  surface,
  onLoadingStateChange,
  mode = "standalone",
  previewVariant = "full",
  pendingAugmentationId: externalPendingAugmentationId = null,
  selectedElement = null,
  onPendingAugmentationChange,
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
  const isSubmitting = generationStep !== null;
  const [requestSettings, setRequestSettings] = useState<RequestSettings>({
    strategy: "sample",
  });
  const [settingsOpen, setSettingsOpen] = useState(true);
  const submissionVersionRef = useRef(0);

  const isPopup = surface === "popup";
  const isFloating = mode === "floating";
  const augmentationEngine = useAugmentationEngine();
  const pendingAugmentationId = externalPendingAugmentationId;
  const isPreviewMode = Boolean(pendingAugmentationId);

  function updatePendingAugmentationId(id: string | null) {
    onPendingAugmentationChange?.(id);
  }

  async function refreshPersistedAugmentations() {
    const storedAugmentations = await persistedAugmentationStore.list();
    setPersistedAugmentations(storedAugmentations);
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
    onLoadingStateChange?.(isSubmitting);
  }, [isSubmitting, onLoadingStateChange]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!prompt.trim()) {
      return;
    }

    const popupShadowRoot = document.querySelector(
      "ai-ui-floating-popup",
    )?.shadowRoot;

    const popup = popupShadowRoot?.getElementById("aui-popup") as HTMLElement;
    const screenshot = await withElementHidden(popup, () =>
      screenshotElement(
        resolveSelectedElement(selectedElement as SelectedElement) as Element,
      ),
    );

    const submissionVersion = submissionVersionRef.current + 1;
    submissionVersionRef.current = submissionVersion;
    setGenerationStep({ phase: "extractor" });
    try {
      const extractor = Example as DOMExtractorSpec;

      // const extractor = await submitAugmentationRequest(prompt, surface, {
      //   selectedElement,
      // });

      if (submissionVersion !== submissionVersionRef.current) {
        return;
      }

      if (extractor) {
        const parsed = validateAndParse(extractor);

        if (parsed.data) {
          setGenerationStep({ phase: "ui", data: parsed.data });
          const uiSpecString = await createUiSpec(prompt, surface, screenshot, {
            selectedElement,
            data: parsed.data,
            strategy: requestSettings.strategy,
          });

          // const uiSpecString = "a";

          if (submissionVersion !== submissionVersionRef.current) {
            return;
          }

          logger.info("Generated UI spec.", uiSpecString);

          if (uiSpecString && augmentationEngine) {
            const injectedAugmentation = await augmentationEngine.inject(
              extractor,
              uiSpecString,
              requestSettings.strategy,
            );

            if (submissionVersion !== submissionVersionRef.current) {
              return;
            }

            updatePendingAugmentationId(injectedAugmentation?.id ?? null);
            void handleSettingsToggle("selectionModeEnabled");
          }
        } else {
          logger.warn(
            "Skipping UI spec generation because extractor parsing failed.",
            {
              errors: parsed.errors,
            },
          );
        }
      }
    } finally {
      if (submissionVersion === submissionVersionRef.current) {
        setGenerationStep(null);
      }
    }
  }

  function handleCancelLoading() {
    submissionVersionRef.current += 1;
    setGenerationStep(null);
  }

  async function handleConfirmAugmentation() {
    if (!augmentationEngine || !pendingAugmentationId) return;

    await augmentationEngine.persistAugmentation(pendingAugmentationId);
    await refreshPersistedAugmentations();
    updatePendingAugmentationId(null);
  }

  async function handleDeletePreviewAugmentation() {
    if (!augmentationEngine || !pendingAugmentationId) return;

    augmentationEngine.remove(pendingAugmentationId);
    updatePendingAugmentationId(null);
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
    const steps: {
      phase: GenerationStep["phase"];
      label: string;
      detail: string;
    }[] = [
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
              Preparing your preview
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

                {/* Future options slot — add more <div className="grid gap-1.5"> sections here */}
              </div>
            </Collapsible.Content>
          </Collapsible.Root>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:opacity-60 cursor-pointer"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Building..." : "Generate"}
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
