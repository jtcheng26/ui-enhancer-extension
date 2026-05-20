import type { UsabilityViolation } from '../types';

interface MountedViolationOverlay {
  overlay: HTMLDivElement;
  element: HTMLElement;
}

export class SelectionOverlayRenderer {
  private readonly hoverOverlay = document.createElement('div');

  private readonly selectionOverlay = document.createElement('div');

  private readonly violationOverlays: MountedViolationOverlay[] = [];

  private readonly refreshViolationOverlays = () => {
    this.violationOverlays.forEach(({ overlay, element }) => {
      this.positionOverlay(overlay, element);
    });
  };

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
    this.hoverOverlay.setAttribute('data-aui-overlay', 'true');
    this.selectionOverlay.setAttribute('data-aui-overlay', 'true');
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

  showUsabilityViolations(violations: UsabilityViolation[]) {
    this.clearUsabilityViolations();

    const groupedViolations = new Map<string, UsabilityViolation[]>();

    for (const violation of violations) {
      const group = groupedViolations.get(violation.selector) ?? [];
      group.push(violation);
      groupedViolations.set(violation.selector, group);
    }

    for (const [selector, selectorViolations] of groupedViolations) {
      let element: HTMLElement | null = null;

      try {
        element = document.querySelector<HTMLElement>(selector);
      } catch {
        element = null;
      }

      if (!element) {
        continue;
      }

      const overlay = document.createElement('div');
      this.configureOverlay(overlay, {
        borderColor: 'rgba(225, 29, 72, 0.95)',
        background: 'rgba(251, 113, 133, 0.14)',
      });
      overlay.setAttribute('data-aui-overlay', 'true');
      overlay.style.pointerEvents = 'auto';
      overlay.style.cursor = 'help';
      overlay.title = selectorViolations
        .map(
          (violation) =>
            `${violation.ruleId}: ${violation.description}\nFix: ${violation.resolutionPrompt}`,
        )
        .join('\n');

      const badge = document.createElement('span');
      Object.assign(badge.style, {
        position: 'absolute',
        top: '-10px',
        right: '-10px',
        minWidth: '20px',
        height: '20px',
        padding: '0 6px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '999px',
        background: 'rgba(190, 24, 93, 0.96)',
        color: '#fff',
        fontSize: '11px',
        fontWeight: '700',
        lineHeight: '1',
        pointerEvents: 'none',
        boxShadow: '0 6px 16px rgba(15, 23, 42, 0.22)',
      });
      badge.textContent = String(selectorViolations.length);
      overlay.append(badge);

      this.violationOverlays.push({ overlay, element });
      document.body.append(overlay);
      this.positionOverlay(overlay, element);
    }

    if (this.violationOverlays.length > 0) {
      window.addEventListener('scroll', this.refreshViolationOverlays, true);
      window.addEventListener('resize', this.refreshViolationOverlays, true);
    }
  }

  clearUsabilityViolations() {
    if (this.violationOverlays.length === 0) {
      return;
    }

    window.removeEventListener('scroll', this.refreshViolationOverlays, true);
    window.removeEventListener('resize', this.refreshViolationOverlays, true);

    while (this.violationOverlays.length > 0) {
      this.violationOverlays.pop()?.overlay.remove();
    }
  }

  destroy() {
    this.clearUsabilityViolations();
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
