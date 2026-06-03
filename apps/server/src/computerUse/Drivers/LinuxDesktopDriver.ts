import type {
  ComputerUseAction,
  ComputerUseDriverHealth,
  ComputerUseTarget,
} from "@t3tools/contracts";

import type {
  ComputerUseDriver,
  ComputerUseDriverSession,
  ComputerUseScreenshotBytes,
} from "./ComputerUseDriver.ts";
import { LinuxWaylandDriver } from "./LinuxWaylandDriver.ts";
import { LinuxX11Driver } from "./LinuxX11Driver.ts";

interface DelegatedLinuxSession extends ComputerUseDriverSession {
  readonly delegate: ComputerUseDriver;
  readonly delegateSession: ComputerUseDriverSession;
}

const LINUX_TARGET_PREFIX = "linux:";

function wrapTarget(target: ComputerUseTarget): ComputerUseTarget {
  return {
    ...target,
    id: `${LINUX_TARGET_PREFIX}${target.id}` as ComputerUseTarget["id"],
    driver: "linux",
    permissionKey: target.permissionKey ?? `linux-target:${target.id}`,
  };
}

function unwrapTarget(target: ComputerUseTarget): ComputerUseTarget {
  const rawId = target.id.startsWith(LINUX_TARGET_PREFIX)
    ? target.id.slice(LINUX_TARGET_PREFIX.length)
    : target.id;
  const delegateDriver = rawId.startsWith("wayland:") ? "linux-wayland" : "linux-x11";
  return {
    ...target,
    id: rawId as ComputerUseTarget["id"],
    driver: delegateDriver,
  };
}

function driverLabel(driver: ComputerUseDriver): string {
  return driver.kind === "linux-wayland" ? "Wayland" : "X11";
}

export class LinuxDesktopDriver implements ComputerUseDriver {
  readonly kind = "linux" as const;

  readonly #drivers: ReadonlyArray<ComputerUseDriver> = [
    new LinuxWaylandDriver(),
    new LinuxX11Driver(),
  ];

  async healthCheck(): Promise<ComputerUseDriverHealth> {
    const health = await Promise.all(this.#drivers.map((driver) => driver.healthCheck()));
    const available = health.find((driverHealth) => driverHealth.status === "available");
    const status =
      process.platform !== "linux"
        ? "unsupported"
        : available
          ? "available"
          : health.some((driverHealth) => driverHealth.status === "missing-dependencies")
            ? "missing-dependencies"
            : "unsupported";
    const dependencies = health.flatMap((driverHealth) =>
      driverHealth.dependencies.map((dependency) => ({
        ...dependency,
        name: `${driverHealth.driver}:${dependency.name}`,
      })),
    );
    return {
      driver: this.kind,
      status,
      message: available
        ? "Linux desktop control is available through an independent native desktop backend."
        : process.platform !== "linux"
          ? "Linux desktop control requires Linux."
          : "Linux desktop control requires the independent KWin Wayland or X11/MPX cursor backend.",
      dependencies,
    };
  }

  async listTargets(): Promise<ReadonlyArray<ComputerUseTarget>> {
    const targetGroups = await Promise.all(
      this.#drivers.map((driver) => driver.listTargets().catch(() => [])),
    );
    return targetGroups.flat().map(wrapTarget);
  }

  async startSession(target: ComputerUseTarget): Promise<ComputerUseDriverSession> {
    const delegateTarget = unwrapTarget(target);
    const delegate = this.#drivers.find((driver) => driver.kind === delegateTarget.driver);
    if (!delegate) {
      throw new Error(`No Linux desktop delegate is available for ${delegateTarget.driver}.`);
    }
    const delegateSession = await delegate.startSession(delegateTarget);
    const session: DelegatedLinuxSession = {
      id: `driver:linux:${driverLabel(delegate)}:${delegateSession.id}`,
      target,
      delegate,
      delegateSession,
    };
    return session;
  }

  async captureScreenshot(session: ComputerUseDriverSession): Promise<ComputerUseScreenshotBytes> {
    const delegatedSession = session as DelegatedLinuxSession;
    return delegatedSession.delegate.captureScreenshot(delegatedSession.delegateSession);
  }

  async executeAction(session: ComputerUseDriverSession, action: ComputerUseAction): Promise<void> {
    const delegatedSession = session as DelegatedLinuxSession;
    await delegatedSession.delegate.executeAction(delegatedSession.delegateSession, action);
  }

  async stopSession(session: ComputerUseDriverSession): Promise<void> {
    const delegatedSession = session as DelegatedLinuxSession;
    await delegatedSession.delegate.stopSession(delegatedSession.delegateSession);
  }
}
