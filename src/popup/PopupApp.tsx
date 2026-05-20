import type {
  SelectedElement,
  UsabilityGenerationTask,
} from '../types';
import { CommandPanel } from './components/CommandPanel';

interface PopupAppProps {
  mode?: 'standalone' | 'floating';
  onLoadingStateChange?: (enabled: boolean) => void;
  runWithUiHidden?: <T>(task: () => Promise<T>) => Promise<T>;
  previewVariant?: 'full' | 'prompt';
  pendingAugmentationId?: string | null;
  selectedElement?: SelectedElement | null;
  onPendingAugmentationChange?: (id: string | null) => void;
  usabilityGenerationQueue?: UsabilityGenerationTask[];
  activeUsabilityGenerationTaskId?: string | null;
  onUsabilityGenerationQueueChange?: (tasks: UsabilityGenerationTask[]) => void;
  onActiveUsabilityGenerationTaskIdChange?: (id: string | null) => void;
  onRequestClose?: () => void;
  onPreviewModeChange?: (enabled: boolean) => void;
}

export function PopupApp({
  mode = 'standalone',
  onLoadingStateChange,
  runWithUiHidden,
  previewVariant = 'full',
  pendingAugmentationId = null,
  selectedElement = null,
  onPendingAugmentationChange,
  usabilityGenerationQueue,
  activeUsabilityGenerationTaskId,
  onUsabilityGenerationQueueChange,
  onActiveUsabilityGenerationTaskIdChange,
  onRequestClose,
  onPreviewModeChange,
}: PopupAppProps) {
  return (
    <CommandPanel
      mode={mode}
      onLoadingStateChange={onLoadingStateChange}
      runWithUiHidden={runWithUiHidden}
      pendingAugmentationId={pendingAugmentationId}
      previewVariant={previewVariant}
      onPendingAugmentationChange={onPendingAugmentationChange}
      usabilityGenerationQueue={usabilityGenerationQueue}
      activeUsabilityGenerationTaskId={activeUsabilityGenerationTaskId}
      onUsabilityGenerationQueueChange={onUsabilityGenerationQueueChange}
      onActiveUsabilityGenerationTaskIdChange={
        onActiveUsabilityGenerationTaskIdChange
      }
      onPreviewModeChange={onPreviewModeChange}
      selectedElement={selectedElement}
      onRequestClose={onRequestClose}
      surface="popup"
    />
  );
}
