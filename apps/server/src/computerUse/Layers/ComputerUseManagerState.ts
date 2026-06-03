import type {
  ComputerUseApprovalRequest,
  ComputerUseAuditEntry,
  ComputerUseScreenshot,
  ComputerUseSession,
} from "@t3tools/contracts";

import type { ComputerUseDriverSession } from "../Drivers/ComputerUseDriver.ts";

export interface ManagedSession {
  readonly session: ComputerUseSession;
  readonly driverSession: ComputerUseDriverSession;
}

export interface ComputerUseState {
  readonly allowedTargetIds: ReadonlySet<string>;
  readonly sessions: ReadonlyMap<string, ManagedSession>;
  readonly screenshots: ReadonlyMap<string, ComputerUseScreenshot>;
  readonly approvals: ReadonlyMap<string, ComputerUseApprovalRequest>;
  readonly auditLog: ReadonlyArray<ComputerUseAuditEntry>;
}
