export interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface SelectedElement {
  id: string;
  tagName: string;
  selector: string;
  textPreview: string;
  attributes: Record<string, string>;
  rect: ElementRect;
  pageUrl: string;
  selectedAt: string;
}

export interface AugmentationRequest {
  id: string;
  prompt: string;
  createdAt: string;
  source: "popup" | "sidepanel" | "content";
  status: "draft" | "queued" | "mock-submitted";
  selectedElementId?: string;
}

export interface InjectedAugmentation {
  id: string;
  kind: "placeholder-card" | "button" | "overlay";
  label: string;
  containerId: string;
  createdAt: string;
  status: "injected" | "removed";
}

export interface ParsedSchema {
  id: string;
  sourceUrl: string;
  format: "json" | "yaml" | "unknown";
  title?: string;
  version?: string;
  document: unknown;
  endpointPaths: string[];
  warnings: string[];
  discoveredAt: string;
}

export interface StoredAugmentationConfig {
  id: string;
  name: string;
  selector: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  promptTemplate?: string;
  notes?: string;
}

export interface ExtensionSettings {
  selectionModeEnabled: boolean;
  injectDemoCardOnLoad: boolean;
  customSchemaUrl: string;
  lastCommand?: string;
}

export interface SchemaDiscoveryCandidate {
  url: string;
  source: "default" | "custom";
}

export interface SchemaDiscoveryOptions {
  baseUrl: string;
  customUrl?: string;
  persistResult?: boolean;
}

export interface SchemaDiscoveryResult {
  schema?: ParsedSchema;
  attemptedUrls: string[];
  errors: string[];
}

export type ExtensionRuntimeMessage =
  | {
      type: "command/submit";
      payload: AugmentationRequest;
    }
  | {
      type: "schema/discover";
      payload: SchemaDiscoveryOptions;
    }
  | {
      type: "selection/toggle";
      payload: {
        enabled: boolean;
      };
    }
  | {
      type: "floating-ui/open";
      payload?: {
        source: "selection" | "toolbar";
        selectedElement?: SelectedElement | null;
      };
    }
  | {
      type: "floating-ui/close";
    };
