import type { ElementRect, SelectedElement } from '../types';

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

function buildSelector(element: HTMLElement) {
  if (element.id) {
    return `#${element.id}`;
  }

  const classNames = Array.from(element.classList).slice(0, 2);
  if (classNames.length > 0) {
    return `${element.tagName.toLowerCase()}.${classNames.join('.')}`;
  }

  return element.tagName.toLowerCase();
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
    selector: buildSelector(element),
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
