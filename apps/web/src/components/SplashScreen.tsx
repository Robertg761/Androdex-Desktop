import { LiquidGlassBackdrop } from "./ui/liquid-glass";

export function SplashScreen() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <LiquidGlassBackdrop variant="app" />
      <div
        className="liquid-glass-surface liquid-glass-surface-raised relative z-10 flex size-24 items-center justify-center rounded-lg border"
        aria-label="Androdex splash screen"
      >
        <img alt="Androdex" className="size-16 object-contain" src="/apple-touch-icon.png" />
      </div>
    </div>
  );
}
