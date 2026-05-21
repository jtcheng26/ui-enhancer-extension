import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type {
  SelectedElement,
  UsabilityGenerationTask,
} from "../types";
import { PopupApp } from "../popup/PopupApp";

interface FloatingWindowProps {
  selectedElement: SelectedElement | null;
  onClose: () => void;
}

const DEFAULT_POSITION = { x: 24, y: 24 };
const DEFAULT_SIZE = { width: 440, height: 700 };
const MIN_SIZE = { width: 320, height: 320 };

type ResizeEdge = "e" | "s" | "se" | null;

export function FloatingWindow({
  selectedElement,
  onClose,
}: FloatingWindowProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isUiHiddenForCapture, setIsUiHiddenForCapture] = useState(false);
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [pendingAugmentationId, setPendingAugmentationId] = useState<
    string | null
  >(null);
  const [usabilityGenerationQueue, setUsabilityGenerationQueue] = useState<
    UsabilityGenerationTask[]
  >([]);
  const [activeUsabilityGenerationTaskId, setActiveUsabilityGenerationTaskId] =
    useState<string | null>(null);

  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const captureRootRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  // ── Drag ────────────────────────────────────────────────────────────────────

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (isLoading) return;
    if ((event.target as HTMLElement).closest("button")) return;

    dragOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (isLoading) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    setPosition({
      x: Math.max(12, event.clientX - dragOffsetRef.current.x),
      y: Math.max(12, event.clientY - dragOffsetRef.current.y),
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  // ── Resize ───────────────────────────────────────────────────────────────────

  function handleResizePointerDown(
    edge: ResizeEdge,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    event.stopPropagation();
    resizeRef.current = {
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startW: size.width,
      startH: size.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (isLoading) return;
    if (
      !event.currentTarget.hasPointerCapture(event.pointerId) ||
      !resizeRef.current
    )
      return;

    const { edge, startX, startY, startW, startH } = resizeRef.current;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    setSize({
      width:
        edge === "e" || edge === "se"
          ? Math.max(MIN_SIZE.width, startW + dx)
          : size.width,
      height:
        edge === "s" || edge === "se"
          ? Math.max(MIN_SIZE.height, startH + dy)
          : size.height,
    });
  }

  function handleResizePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeRef.current = null;
  }

  // ── Shared resize handle props ───────────────────────────────────────────────

  function resizeHandleProps(edge: ResizeEdge) {
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) =>
        handleResizePointerDown(edge, e),
      onPointerMove: handleResizePointerMove,
      onPointerUp: handleResizePointerUp,
    };
  }

  async function waitForUiPaint(delayMs = 180) {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  async function runWithUiHidden<T>(task: () => Promise<T>) {
    const captureRoot = captureRootRef.current;
    const previousDisplay = captureRoot?.style.display;

    if (captureRoot) {
      captureRoot.style.display = "none";
    }

    setIsUiHiddenForCapture(true);
    await waitForUiPaint();

    try {
      return await task();
    } finally {
      if (captureRoot) {
        captureRoot.style.display = previousDisplay ?? "";
      }

      setIsUiHiddenForCapture(false);
      await waitForUiPaint(0);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (pendingAugmentationId) {
    return (
      <div
        ref={captureRootRef}
        className="fixed bottom-6 left-1/2 z-[2147483647] -translate-x-1/2"
        style={{ display: isUiHiddenForCapture ? "none" : undefined }}
      >
        <div className="w-[min(380px,calc(100vw-24px))] rounded-[26px] bg-slate-900/20 p-[6px] backdrop-blur-md shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
          <div className="relative overflow-hidden rounded-[22px] bg-slate-800">
            <PopupApp
              mode="floating"
              onLoadingStateChange={setIsLoading}
              runWithUiHidden={runWithUiHidden}
              pendingAugmentationId={pendingAugmentationId}
              previewVariant="prompt"
              onPendingAugmentationChange={setPendingAugmentationId}
              usabilityGenerationQueue={usabilityGenerationQueue}
              activeUsabilityGenerationTaskId={
                activeUsabilityGenerationTaskId
              }
              onUsabilityGenerationQueueChange={setUsabilityGenerationQueue}
              onActiveUsabilityGenerationTaskIdChange={
                setActiveUsabilityGenerationTaskId
              }
              selectedElement={selectedElement}
              onPreviewModeChange={setIsPreviewMode}
              onRequestClose={onClose}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={captureRootRef}
      style={{ display: isUiHiddenForCapture ? "none" : undefined }}
    >
      {/* {isLoading ? (
        <div className="fixed inset-0 z-[2147483645] bg-white/18 backdrop-blur-md" />
      ) : null} */}
      <div
        className="fixed left-0 top-0 z-[2147483647]" id="aui-popup"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        <div
          className="rounded-[30px] bg-slate-900/20 p-[6px] backdrop-blur-md shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
          style={{ width: size.width, height: size.height }}
        >
          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[28px] bg-white">
            <div
              className={`flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-slate-950 px-4 py-3 text-white ${
                isLoading ? "cursor-default" : "cursor-move"
              }`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200">
                  Workspace
                </p>
              </div>

              <button
                className="z-100 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg leading-none text-white transition hover:bg-white/20"
                type="button"
                onClick={onClose}
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <PopupApp
                mode="floating"
                onLoadingStateChange={setIsLoading}
                runWithUiHidden={runWithUiHidden}
                pendingAugmentationId={pendingAugmentationId}
                previewVariant="full"
                onPendingAugmentationChange={setPendingAugmentationId}
                usabilityGenerationQueue={usabilityGenerationQueue}
                activeUsabilityGenerationTaskId={
                  activeUsabilityGenerationTaskId
                }
                onUsabilityGenerationQueueChange={setUsabilityGenerationQueue}
                onActiveUsabilityGenerationTaskIdChange={
                  setActiveUsabilityGenerationTaskId
                }
                selectedElement={selectedElement}
                onPreviewModeChange={setIsPreviewMode}
                onRequestClose={onClose}
              />
            </div>

            <div
              className={`absolute right-0 top-0 h-full w-2 ${
                isLoading ? "cursor-default" : "cursor-ew-resize"
              }`}
              {...resizeHandleProps("e")}
            />
            <div
              className={`absolute bottom-0 left-0 h-2 w-full ${
                isLoading ? "cursor-default" : "cursor-s-resize"
              }`}
              {...resizeHandleProps("s")}
            />
            <div
              className={`absolute bottom-0 right-0 h-4 w-4 ${
                isLoading ? "cursor-default" : "cursor-se-resize"
              }`}
              {...resizeHandleProps("se")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
