import { type ProviderDriverKind, type ProviderInstanceId } from "@t3tools/contracts";
import { memo } from "react";
import {
  getDisplayModelName,
  getTriggerDisplayModelLabel,
  type ModelEsque,
} from "./providerIconUtils";
import { ComboboxItem } from "../ui/combobox";
import { Kbd } from "../ui/kbd";
import { cn } from "~/lib/utils";

export const ModelListRow = memo(function ModelListRow(props: {
  index: number;
  model: ModelEsque;
  /** Instance the model belongs to — the routing key used in combobox values. */
  instanceId: ProviderInstanceId;
  /** Driver kind of the instance — used for the provider icon glyph. */
  driverKind: ProviderDriverKind;
  /**
   * Display name to show in the secondary line (provider footer). Usually
   * the instance's configured `displayName` so custom instances like
   * "Codex Personal" render with their user-authored label.
   */
  providerDisplayName: string;
  providerAccentColor?: string | undefined;
  isFavorite: boolean;
  showProvider: boolean;
  preferShortName?: boolean;
  useTriggerLabel?: boolean;
  showNewBadge?: boolean;
  jumpLabel?: string | null;
  onToggleFavorite: () => void;
}) {
  const providerLabel = props.model.subProvider
    ? `${props.providerDisplayName} · ${props.model.subProvider}`
    : props.providerDisplayName;

  return (
    <ComboboxItem
      hideIndicator
      index={props.index}
      value={`${props.instanceId}:${props.model.slug}`}
      contentClassName="flex w-full items-start gap-1.5"
      className={cn(
        "group w-full cursor-pointer rounded px-2 py-1.5 transition-colors",
        "data-highlighted:bg-primary/10 data-selected:bg-primary/12 data-selected:text-foreground",
      )}
    >
      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium leading-snug">
            <span className="truncate">
              {props.useTriggerLabel
                ? getTriggerDisplayModelLabel(props.model)
                : getDisplayModelName(
                    props.model,
                    props.preferShortName ? { preferShortName: true } : undefined,
                  )}
            </span>
            {props.showNewBadge ? (
              <span
                className="shrink-0 rounded border border-amber-500/35 bg-amber-500/15 px-0.5 py-px text-[10px] font-bold uppercase leading-none tracking-wide text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/12 dark:text-amber-200"
                aria-label="New model"
              >
                New
              </span>
            ) : null}
          </div>
          {props.jumpLabel ? (
            <Kbd className="h-4 min-w-0 shrink-0 rounded-sm px-1.5 text-[10px]">
              {props.jumpLabel}
            </Kbd>
          ) : null}
          <button
            className={cn(
              "shrink-0 cursor-pointer rounded px-1 py-0.5 text-[10px] leading-none text-muted-foreground/70 transition-opacity hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              props.isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            onClick={(event) => {
              event.stopPropagation();
              props.onToggleFavorite();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            type="button"
            aria-label={props.isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            {props.isFavorite ? "Saved" : "Save"}
          </button>
        </div>
        {props.showProvider && (
          <div className="mt-0.5 flex items-center gap-1">
            {props.providerAccentColor ? (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: props.providerAccentColor }}
                aria-hidden
              />
            ) : null}
            <span className="text-xs font-normal leading-snug text-muted-foreground/70 truncate">
              {providerLabel}
            </span>
          </div>
        )}
      </div>
    </ComboboxItem>
  );
});
