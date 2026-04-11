import type { SelectedElement } from '../types';
import { CommandPanel } from './components/CommandPanel';

interface PopupAppProps {
  mode?: 'standalone' | 'floating';
  selectedElement?: SelectedElement | null;
  onRequestClose?: () => void;
}

export function PopupApp({
  mode = 'standalone',
  selectedElement = null,
  onRequestClose,
}: PopupAppProps) {
  return (
    <CommandPanel
      mode={mode}
      selectedElement={selectedElement}
      onRequestClose={onRequestClose}
      surface="popup"
    />
  );
}
