import type { SelectedElement } from '../types';
import { logger } from '../utils/logger';
import { mapElementToSelectedElement } from './selection-state';
import type { SelectionOverlayRenderer } from './selection-overlay';
import { isExtensionUiElement } from './ui-guards';

interface HoverHighlighterOptions {
  overlay: SelectionOverlayRenderer;
  onHover?: (selectedElement: SelectedElement) => void;
}

export class HoverHighlighter {
  private active = false;

  private readonly handlePointerMove = (event: PointerEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;

    if (!target || isExtensionUiElement(target)) {
      this.options.overlay.clearHover();
      return;
    }

    this.options.overlay.showHoverFor(target);
    this.options.onHover?.(mapElementToSelectedElement(target));
  };

  constructor(private readonly options: HoverHighlighterOptions) {}

  start() {
    if (this.active) {
      return;
    }

    this.active = true;
    document.addEventListener('pointermove', this.handlePointerMove, true);
    logger.info('Hover highlighter attached.');
  }

  stop() {
    if (!this.active) {
      return;
    }

    this.active = false;
    document.removeEventListener('pointermove', this.handlePointerMove, true);
    this.options.overlay.clearHover();
  }
}
