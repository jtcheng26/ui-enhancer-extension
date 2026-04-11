import type { InjectedAugmentation } from '../types';
import { logger } from '../utils/logger';

function applyPlaceholderStyles(element: HTMLDivElement) {
  Object.assign(element.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483644',
    maxWidth: '280px',
    padding: '12px 14px',
    border: '1px solid rgba(29, 35, 48, 0.16)',
    borderRadius: '16px',
    background: 'rgba(255, 250, 241, 0.96)',
    boxShadow: '0 16px 36px rgba(50, 50, 93, 0.16)',
    color: '#1d2330',
    fontFamily: "'IBM Plex Sans', 'Avenir Next', 'Segoe UI', sans-serif",
  });
}

export class AugmentationEngine {
  private readonly augmentations = new Map<string, InjectedAugmentation>();

  constructor(private readonly root: Document) {}

  injectPlaceholderCard(label = 'Prototype augmentation placeholder') {
    const containerId = `aui-augmentation-${crypto.randomUUID()}`;
    const container = this.root.createElement('div');

    container.id = containerId;
    applyPlaceholderStyles(container);
    container.innerHTML = `
      <span style="display:block;margin-bottom:4px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#865f2d;">
        UI Augmentation
      </span>
      <div style="font-size:13px;line-height:1.4;color:#1d2330;">
        ${label}. TODO: Replace this demo container with real augmentation rendering.
      </div>
    `;

    this.root.body.append(container);

    const augmentation: InjectedAugmentation = {
      id: crypto.randomUUID(),
      kind: 'placeholder-card',
      label,
      containerId,
      createdAt: new Date().toISOString(),
      status: 'injected',
    };

    this.augmentations.set(augmentation.id, augmentation);
    logger.info('Injected placeholder augmentation container.', augmentation);
    return augmentation;
  }

  list() {
    return Array.from(this.augmentations.values());
  }

  remove(id: string) {
    const augmentation = this.augmentations.get(id);
    if (!augmentation) {
      return false;
    }

    this.root.getElementById(augmentation.containerId)?.remove();
    augmentation.status = "removed";
    this.augmentations.delete(id);
    return true;
  }

  destroy() {
    this.list().forEach((item) => this.remove(item.id));
  }

  // TODO: Add selector-aware rendering and transformation hooks.
}
