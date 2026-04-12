import { useEffect, useState, type FormEvent } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";

import { discoverAndStoreSchema } from "../../schema/schema-service";
import { requestStore } from "../../storage/request-store";
import { settingsStore } from "../../storage/settings-store";
import {
  createUiSpec,
  submitAugmentationRequest,
} from "../../services/command-service";
import type {
  AugmentationRequest,
  ExtensionSettings,
  SchemaDiscoveryResult,
  SelectedElement,
} from "../../types";
import { validateAndParse } from "@/services/dom-extractor";
import { logger } from "@/utils/logger";

import Example from "../../schema/dom-extraction-example.json";

interface CommandPanelProps {
  surface: "popup" | "sidepanel";
  mode?: "standalone" | "floating";
  selectedElement?: SelectedElement | null;
  onRequestClose?: () => void;
}

type AugmentationStrategy = "schema" | "rerender";

interface RequestSettings {
  strategy: AugmentationStrategy;
}

const STRATEGY_OPTIONS: {
  value: AugmentationStrategy;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "rerender",
    label: "Re-render components",
    description: "Modify and re-render existing UI components directly",
    icon: "🎨",
  },
  {
    value: "schema",
    label: "API schema",
    description: "Use the page's API schema to inform augmentations",
    icon: "📐",
  },
];

export function CommandPanel({
  surface,
  mode = "standalone",
  selectedElement = null,
  onRequestClose,
}: CommandPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<AugmentationRequest[]>([]);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestSettings, setRequestSettings] = useState<RequestSettings>({
    strategy: "rerender",
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isPopup = surface === "popup";
  const isFloating = mode === "floating";

  useEffect(() => {
    void (async () => {
      const [storedHistory, storedSettings] = await Promise.all([
        requestStore.list(),
        settingsStore.get(),
      ]);

      setHistory(storedHistory);
      setSettings(storedSettings);
      setPrompt(storedSettings.lastCommand ?? "");
    })();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!prompt.trim()) {
      return;
    }

    setIsSubmitting(true);
    const res = Example;
    // await submitAugmentationRequest(prompt, surface, {
    //   selectedElement,
    // });
    if (res) {
      const parsed = validateAndParse(res);

      if (parsed.data) {
        const uiSpec = await createUiSpec(prompt, surface, {
          selectedElement,
          data: parsed.data,
        });

        logger.info("Generated UI spec.", uiSpec);
      } else {
        logger.warn(
          "Skipping UI spec generation because extractor parsing failed.",
          {
            errors: parsed.errors,
          },
        );
      }
    }
    // const storedHistory = await requestStore.list();
    // setHistory(storedHistory);
    // setPrompt(request.prompt);
    setIsSubmitting(false);
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
            Experimental Prototype
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            AI UI augmentation workspace
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            This is intentionally a stubbed command surface. Requests are stored
            locally for now and routed to future AI tooling later.
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
              Element selection mode
            </p>
            <p
              className={`text-[11px] leading-4 ${settings?.selectionModeEnabled ? "text-sky-600" : "text-slate-500"}`}
            >
              {settings?.selectionModeEnabled
                ? "Active — click any element to target it, hover highlights enabled"
                : "Inactive — enable to click and highlight page elements"}
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
              Current selection
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {selectedElement.selector}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">
              {selectedElement.textPreview || "No text preview captured yet."}
            </p>
          </div>
        ) : null}

        {/* ── Prompt form ── */}
        <form className="grid gap-2" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-xs font-semibold tracking-wide text-slate-700">
              Natural language request
            </span>
            <textarea
              className="min-h-32 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-sky-100"
              placeholder="Example: Add a compact summary card beside the selected checkout section."
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
                Request options
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
                    Augmentation strategy
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
              {isSubmitting ? "Creating..." : "Create"}
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-sky-100 px-4 py-2 text-sm font-medium text-slate-800 transition hover:-translate-y-0.5 hover:bg-sky-200 cursor-pointer"
              type="button"
              onClick={() => setPrompt("")}
            >
              Clear
            </button>
          </div>
        </form>

        {/* ── Past creations ── */}
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Past Creations
            </h2>
            <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">
              {history.length}
            </span>
          </div>

          <div className="grid max-h-56 gap-2 overflow-auto">
            {history.length === 0 ? (
              <div className="rounded-2xl border border-slate-900/8 bg-slate-50/80 p-4">
                <p className="text-sm leading-6 text-slate-600">
                  No creations yet. Submit one above!
                </p>
              </div>
            ) : (
              history.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-1 rounded-2xl border border-sky-100 bg-sky-50/70 p-3"
                >
                  <p className="text-sm text-slate-900">{item.prompt}</p>
                  <span className="text-xs text-slate-500">
                    {item.source} • {item.status} •{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
