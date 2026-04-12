import type { UISpec } from "../ai/providers/ai-provider";

type AugmentationInjector = (
  selector: string,
  spec: UISpec,
) => Promise<boolean> | boolean;

let injector: AugmentationInjector | null = null;

export function registerAugmentationInjector(nextInjector: AugmentationInjector) {
  injector = nextInjector;
}

export function clearAugmentationInjector() {
  injector = null;
}

export async function injectViaRegisteredAugmentation(
  selector: string,
  spec: UISpec,
) {
  if (!injector) {
    return false;
  }

  return await injector(selector, spec);
}
