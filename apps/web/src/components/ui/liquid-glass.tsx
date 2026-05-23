import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "~/lib/utils";

type LiquidGlassBackdropVariant = "app" | "auth" | "error";
type LiquidGlassSurfaceVariant = "default" | "raised" | "floating" | "control" | "readable";

export function LiquidGlassBackdrop({
  className,
  variant = "app",
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  variant?: LiquidGlassBackdropVariant;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("liquid-glass-backdrop", className)}
      data-variant={variant}
      {...props}
    />
  );
}

export function LiquidGlassScreen({
  children,
  className,
  contentClassName,
  variant = "auth",
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  variant?: LiquidGlassBackdropVariant;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6",
        className,
      )}
    >
      <LiquidGlassBackdrop variant={variant} />
      <div className={cn("relative z-10 w-full", contentClassName)}>{children}</div>
    </div>
  );
}

export function LiquidGlassSurface({
  as: Component = "div",
  children,
  className,
  variant = "default",
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  as?: "article" | "aside" | "div" | "section";
  variant?: LiquidGlassSurfaceVariant;
}) {
  return (
    <Component
      className={cn(
        "liquid-glass-surface rounded-lg border text-card-foreground",
        variant === "raised" && "liquid-glass-surface-raised",
        variant === "floating" && "liquid-glass-surface-floating",
        variant === "control" && "liquid-glass-control",
        variant === "readable" && "liquid-glass-readable",
        className,
      )}
      data-liquid-glass-surface={variant}
      {...props}
    >
      {children}
    </Component>
  );
}
