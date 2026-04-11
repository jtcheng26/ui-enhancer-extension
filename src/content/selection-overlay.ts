export class SelectionOverlayRenderer {
  private readonly hoverOverlay = document.createElement('div');

  private readonly selectionOverlay = document.createElement('div');

  constructor() {
    this.configureOverlay(this.hoverOverlay, {
      borderColor: 'rgba(73, 132, 255, 0.95)',
      background: 'rgba(73, 132, 255, 0.12)',
    });
    this.configureOverlay(this.selectionOverlay, {
      borderColor: 'rgba(255, 117, 47, 0.95)',
      background: 'rgba(255, 117, 47, 0.12)',
    });
    this.hideOverlay(this.hoverOverlay);
    this.hideOverlay(this.selectionOverlay);
    document.body.append(this.hoverOverlay, this.selectionOverlay);
  }

  showHoverFor(element: HTMLElement) {
    this.positionOverlay(this.hoverOverlay, element);
  }

  showSelectionFor(element: HTMLElement) {
    this.positionOverlay(this.selectionOverlay, element);
  }

  clearHover() {
    this.hideOverlay(this.hoverOverlay);
  }

  clearSelection() {
    this.hideOverlay(this.selectionOverlay);
  }

  destroy() {
    this.hoverOverlay.remove();
    this.selectionOverlay.remove();
  }

  private positionOverlay(overlay: HTMLDivElement, element: HTMLElement) {
    const rect = element.getBoundingClientRect();

    overlay.style.display = 'block';
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  private hideOverlay(overlay: HTMLDivElement) {
    overlay.style.display = 'none';
    overlay.style.width = '0';
    overlay.style.height = '0';
  }

  private configureOverlay(
    overlay: HTMLDivElement,
    options: {
      borderColor: string;
      background: string;
    },
  ) {
    Object.assign(overlay.style, {
      boxSizing: 'border-box',
      pointerEvents: 'none',
      position: 'fixed',
      zIndex: '2147483646',
      borderRadius: '8px',
      transition: 'transform 80ms ease, width 80ms ease, height 80ms ease',
      border: `2px solid ${options.borderColor}`,
      background: options.background,
    });
  }
}
