import React from "react";
import ReactDOM from "react-dom/client";
import type { ContentScriptContext, ShadowRootContentScriptUi } from "#imports";

import { logger } from "../utils/logger";
import type { SelectedElement } from "../types";
import { FloatingWindow } from "./floating-window";

interface OpenFloatingPopupOptions {
  selectedElement?: SelectedElement | null;
}

interface MountedFloatingPopup {
  root: ReactDOM.Root;
}

export class FloatingPopupController {
  private ui?: ShadowRootContentScriptUi<MountedFloatingPopup>;

  private isOpen = false;

  private selectedElement: SelectedElement | null = null;

  constructor(private readonly ctx: ContentScriptContext) {}

  async open(options?: OpenFloatingPopupOptions) {
    if (options && "selectedElement" in options) {
      this.selectedElement = options.selectedElement ?? null;
    }

    await this.ensureUi();
    this.isOpen = true;

    if (this.ui?.mounted) {
      this.render();
    } else {
      this.ui?.mount();
    }

    logger.info("Opened floating in-page popup.", {
      selector: this.selectedElement?.selector,
    });
  }

  close = () => {
    this.isOpen = false;
    this.ui?.mounted?.root.unmount();
    this.ui?.remove();
  };

  toggle = async (options?: OpenFloatingPopupOptions) => {
    if (this.isOpen) {
      this.close();
      return;
    }

    await this.open(options);
  };

  destroy() {
    this.ui?.remove();
    this.ui = undefined;
  }

  private async ensureUi() {
    if (this.ui) {
      return;
    }

    this.ui = await createShadowRootUi(this.ctx, {
      name: "ai-ui-floating-popup",
      position: "overlay",
      anchor: "body",
      append: "last",
      zIndex: 2147483647,
      isolateEvents: [
        "click",
        "mousedown",
        "mouseup",
        "keyup",
        "keydown",
        "keypress",
        "pointerdown",
        "pointerup",
      ],
      onMount: (uiContainer) => {
        const root = ReactDOM.createRoot(uiContainer);
        root.render(
          <FloatingWindow
            selectedElement={this.selectedElement}
            onClose={this.close}
          />,
        );

        return { root };
      },
      onRemove: (mounted) => {
        mounted?.root.unmount();
      },
    });
  }

  private render() {
    if (!this.ui?.mounted) {
      return;
    }

    this.ui.mounted.root.render(
      <FloatingWindow
        selectedElement={this.selectedElement}
        onClose={this.close}
      />,
    );
  }
}
