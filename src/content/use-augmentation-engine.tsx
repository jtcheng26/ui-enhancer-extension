import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import type { AugmentationEngine } from "../services/augmentation-engine";

const AugmentationEngineContext = createContext<AugmentationEngine | null>(null);

interface AugmentationEngineProviderProps {
  engine: AugmentationEngine;
  children: ReactNode;
}

export function AugmentationEngineProvider({
  engine,
  children,
}: AugmentationEngineProviderProps) {
  return (
    <AugmentationEngineContext.Provider value={engine}>
      {children}
    </AugmentationEngineContext.Provider>
  );
}

export function useAugmentationEngine() {
  return useContext(AugmentationEngineContext);
}
