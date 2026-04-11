import type { SelectedElement } from '../types';
import { logger } from '../utils/logger';
import { mapElementToSelectedElement, SelectionStateManager } from './selection-state';
import type { SelectionOverlayRenderer } from './selection-overlay';
import { isExtensionUiElement } from './ui-guards';

interface ClickSelectOptions {
  overlay: SelectionOverlayRenderer;
  state: SelectionStateManager;
  onSelect?: (selectedElement: SelectedElement) => void;
}

export class ClickSelectController {
  private enabled = false;

  private readonly handleClick = (event: MouseEvent) => {
    if (!this.enabled) {
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;

    if (!target || isExtensionUiElement(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const selectedElement = mapElementToSelectedElement(target);
    this.options.overlay.showSelectionFor(target);
    this.options.state.setSelectedElement(selectedElement);
    this.options.onSelect?.(selectedElement);
  };

  constructor(private readonly options: ClickSelectOptions) {}

  enable() {
    if (this.enabled) {
      return;
    }

    this.enabled = true;
    document.addEventListener('click', this.handleClick, true);
    logger.info('Click-to-select mode enabled.');
  }

  disable() {
    if (!this.enabled) {
      return;
    }

    this.enabled = false;
    document.removeEventListener('click', this.handleClick, true);
    this.options.overlay.clearSelection();
    this.options.state.setSelectedElement(null);
    logger.info('Click-to-select mode disabled.');
  }
}
