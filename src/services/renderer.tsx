import { compileSpecStream, createStateStore, Spec } from "@json-render/core";
import { ExtractedValue } from "./dom-extractor";
import ReactDOM from "react-dom/client";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@json-render/react";
import { registry } from "@/ai/ui/catalog";
import SpecExample from "../schema/spec.json";

export interface RenderUpdater {
  update: (data: Record<string, unknown>) => void;
}

// T is what is saved in storage to re-run the ui
export interface RenderSystem {
  render: (
    root: ReactDOM.Root,
    data: Record<string, ExtractedValue>,
    spec: string,
    persistedId?: string,
  ) => RenderUpdater;
}

const jsonRenderer: (
  root: ReactDOM.Root,
  data: Record<string, ExtractedValue>,
  compiledSpec: Spec,
  persistedId?: string,
) => RenderUpdater = (root, data, compiledSpec, persistedId) => {
  const stateStore = createStateStore(data);

  root.render(
    <StateProvider store={stateStore}>
      <VisibilityProvider>
        <ActionProvider>
          <Renderer spec={compiledSpec} registry={registry} />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>,
  );

  return {
    update: (data) => {
      stateStore.update(data);
    },
  };
};

export function renderMarkupString(
  root: ReactDOM.Root,
  data: Record<string, ExtractedValue>,
  spec: string,
  persistedId?: string,
): { update: (data: Record<string, unknown>) => void } {
  function render(data: Record<string, unknown>) {
    const global = { data };
    const html = spec.replace(/\{\{([\w.\[\]]+)\}\}/g, (_, path) => {
      const value = resolvePath(global, path);
      return value != null ? escapeHtml(String(value)) : "";
    });
    root.render(<div dangerouslySetInnerHTML={{ __html: html }} />);
  }

  render(data);

  return {
    update: (data) => render(data),
  };
}

function resolvePath(obj: unknown, path: string): unknown {
  // split on dots and bracket notation: "a.b[2].c" -> ["a", "b", "2", "c"]
  const keys = path.split(/\.|\[(\d+)\]/).filter(Boolean);

  return keys.reduce((curr, key) => {
    if (curr == null) return undefined;
    if (Array.isArray(curr)) return curr[Number(key)];
    if (typeof curr === "object") return (curr as Record<string, unknown>)[key];
    return undefined;
  }, obj as unknown);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export type RenderSystemId = "json-render" | "sample" | "markup";

export const RENDER_SYSTEMS: Record<RenderSystemId, RenderSystem> = {
  "json-render": {
    render: (root, data, spec, persistedId) =>
      jsonRenderer(
        root,
        data,
        compileSpecStream(spec) as unknown as Spec,
        persistedId,
      ),
  },
  sample: {
    render: (root, data, spec, persistedId) =>
      jsonRenderer(root, data, SpecExample, persistedId),
  },
  markup: {
    render: renderMarkupString,
  },
} as const;
