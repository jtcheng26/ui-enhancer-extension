import type { ElementRect, SelectedElement } from '../types';
import { buildElementSelector } from '@/services/selector';

type SelectionListener = (selectedElement: SelectedElement | null) => void;

function rectFromElement(element: HTMLElement): ElementRect {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function mapElementToSelectedElement(element: HTMLElement): SelectedElement {
  const attributes = Array.from(element.attributes).reduce<Record<string, string>>(
    (result, attribute) => {
      if (result && Object.keys(result).length >= 6) {
        return result;
      }

      result[attribute.name] = attribute.value;
      return result;
    },
    {},
  );

  return {
    id: crypto.randomUUID(),
    tagName: element.tagName.toLowerCase(),
    selector: buildElementSelector(element),
    textPreview: element.textContent?.trim().slice(0, 140) ?? '',
    attributes,
    rect: rectFromElement(element),
    pageUrl: window.location.href,
    selectedAt: new Date().toISOString(),
  };
}

export class SelectionStateManager {
  private selectedElement: SelectedElement | null = null;

  private readonly listeners = new Set<SelectionListener>();

  getSelectedElement() {
    return this.selectedElement;
  }

  setSelectedElement(nextSelectedElement: SelectedElement | null) {
    this.selectedElement = nextSelectedElement;
    this.listeners.forEach((listener) => listener(nextSelectedElement));
  }

  subscribe(listener: SelectionListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
}
