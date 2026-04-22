import { compileSpecStream, createStateStore, Spec } from "@json-render/core";
import { ExtractedValue } from "../dom-extractor";
import ReactDOM from "react-dom/client";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@json-render/react";
import { registry } from "@/ai/ui/catalog";
import SpecExample from "../../schema/spec.json";
import { MarkupRenderer } from "./markup/markup-renderer";

export interface RenderUpdater {
  update: (data: Record<string, unknown>) => void;
}

// T is what is saved in storage to re-run the ui
export interface RenderSystem {
  render: (
    root: ReactDOM.Root,
    data: Record<string, ExtractedValue>,
    spec: string,
    uiContainer: HTMLElement,
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

export type RenderSystemId = "json-render" | "sample" | "markup";

export const RENDER_SYSTEMS: Record<RenderSystemId, RenderSystem> = {
  "json-render": {
    render: (root, data, spec, uiContainer, persistedId) =>
      jsonRenderer(
        root,
        data,
        compileSpecStream(spec) as unknown as Spec,
        persistedId,
      ),
  },
  sample: {
    render: (root, data, spec, uiContainer, persistedId) =>
      jsonRenderer(root, data, SpecExample, persistedId),
  },
  markup: MarkupRenderer,
} as const;
