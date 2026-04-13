import type { SelectedElement } from '../types';
import { CommandPanel } from './components/CommandPanel';

interface PopupAppProps {
  mode?: 'standalone' | 'floating';
  onLoadingStateChange?: (enabled: boolean) => void;
  previewVariant?: 'full' | 'prompt';
  pendingAugmentationId?: string | null;
  selectedElement?: SelectedElement | null;
  onPendingAugmentationChange?: (id: string | null) => void;
  onRequestClose?: () => void;
  onPreviewModeChange?: (enabled: boolean) => void;
}

export function PopupApp({
  mode = 'standalone',
  onLoadingStateChange,
  previewVariant = 'full',
  pendingAugmentationId = null,
  selectedElement = null,
  onPendingAugmentationChange,
  onRequestClose,
  onPreviewModeChange,
}: PopupAppProps) {
  return (
    <CommandPanel
      mode={mode}
      onLoadingStateChange={onLoadingStateChange}
      pendingAugmentationId={pendingAugmentationId}
      previewVariant={previewVariant}
      onPendingAugmentationChange={onPendingAugmentationChange}
      onPreviewModeChange={onPreviewModeChange}
      selectedElement={selectedElement}
      onRequestClose={onRequestClose}
      surface="popup"
    />
  );
}
