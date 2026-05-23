import type {
  LocalWhisperLanguageMode,
  LocalWhisperModel,
  LocalWhisperModelId,
  LocalWhisperRuntimeStatus,
} from "@t3tools/contracts";
import { LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";

export interface LocalWhisperDownloadProgress {
  readonly modelId: LocalWhisperModelId;
  readonly downloadedBytes: number;
  readonly totalBytes: number;
  readonly percent: number;
}

interface LocalWhisperModelMenuProps {
  readonly open: boolean;
  readonly runtime: LocalWhisperRuntimeStatus | null;
  readonly models: readonly LocalWhisperModel[];
  readonly loading: boolean;
  readonly selectedModelId: LocalWhisperModelId | null;
  readonly languageMode: LocalWhisperLanguageMode;
  readonly downloadingModelId: LocalWhisperModelId | null;
  readonly downloadProgress: LocalWhisperDownloadProgress | null;
  readonly onClose: () => void;
  readonly onSelect: (model: LocalWhisperModel) => void;
  readonly onLanguageModeChange: (mode: LocalWhisperLanguageMode) => void;
  readonly onCancelDownload: () => void;
}

function formatProgress(progress: LocalWhisperDownloadProgress): string {
  return `${Math.round(progress.percent)}%`;
}

function modelStatusLabel(input: {
  readonly model: LocalWhisperModel;
  readonly downloadingModelId: LocalWhisperModelId | null;
  readonly downloadProgress: LocalWhisperDownloadProgress | null;
}): string {
  if (input.downloadingModelId === input.model.id) {
    return input.downloadProgress ? formatProgress(input.downloadProgress) : "Starting";
  }
  if (input.model.installed) {
    return "Installed";
  }
  if (input.model.path) {
    return "Repair";
  }
  return "Download";
}

export function LocalWhisperModelMenu({
  open,
  runtime,
  models,
  loading,
  selectedModelId,
  languageMode,
  downloadingModelId,
  downloadProgress,
  onClose,
  onSelect,
  onLanguageModeChange,
  onCancelDownload,
}: LocalWhisperModelMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="liquid-glass-surface liquid-glass-surface-floating flex w-[min(24rem,calc(100vw-2rem))] max-w-full flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
      data-local-whisper-model-menu="true"
    >
      <div className="flex items-start gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Local voice input</div>
          <div className="text-xs leading-4 text-muted-foreground">Models are saved locally.</div>
        </div>
        {downloadingModelId ? (
          <Button
            aria-label="Cancel model download"
            size="xs"
            variant="ghost"
            onClick={onCancelDownload}
          >
            Cancel
          </Button>
        ) : null}
        <Button aria-label="Close model picker" size="xs" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3 border-b px-3 py-1.5">
        <span className="min-w-0 text-xs text-muted-foreground">Language</span>
        <span className="inline-flex shrink-0 overflow-hidden rounded-md border bg-background p-0.5">
          {(
            [
              ["english", "English"],
              ["auto", "Auto"],
            ] satisfies ReadonlyArray<readonly [LocalWhisperLanguageMode, string]>
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={languageMode === mode}
              className={cn(
                "rounded px-2 py-1 text-xs transition-colors",
                languageMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              onClick={() => onLanguageModeChange(mode)}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      {runtime && !runtime.available ? (
        <div className="flex gap-2 border-b border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          <div>{runtime.installHint}</div>
        </div>
      ) : null}
      <div className="max-h-80 overflow-y-auto p-1">
        {loading && models.length === 0 ? (
          <div className="px-2.5 py-6 text-center text-xs text-muted-foreground">
            Loading models
          </div>
        ) : null}
        {models.map((model) => {
          const isSelected = selectedModelId === model.id;
          const isDownloading = downloadingModelId === model.id;
          const statusLabel = modelStatusLabel({ model, downloadingModelId, downloadProgress });
          return (
            <button
              key={model.id}
              type="button"
              title={model.description}
              className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-primary/8 focus-visible:bg-primary/10",
                isSelected && "bg-primary/12 font-medium",
              )}
              disabled={downloadingModelId !== null && !isDownloading}
              onClick={() => onSelect(model)}
            >
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium">{model.name}</span>
                  {model.recommended ? (
                    <span className="rounded border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Recommended
                    </span>
                  ) : null}
                  {model.quantization ? (
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                      {model.quantization}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">
                  {model.diskLabel} · {model.language === "english" ? "English" : "Multilingual"}
                </span>
                {isDownloading && downloadProgress ? (
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full bg-primary transition-[width]"
                      style={{ width: `${Math.max(2, Math.min(100, downloadProgress.percent))}%` }}
                    />
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 inline-flex min-w-16 items-center justify-end text-xs text-muted-foreground">
                {isDownloading ? <LoaderCircleIcon className="mr-1 size-3 animate-spin" /> : null}
                {statusLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
