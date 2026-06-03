import type { ComputerUseDriverKind } from "@t3tools/contracts";

import type { ComputerUseDriver } from "./ComputerUseDriver.ts";
import { LinuxDesktopDriver } from "./LinuxDesktopDriver.ts";
import { LinuxWaylandDriver } from "./LinuxWaylandDriver.ts";
import { LinuxX11Driver } from "./LinuxX11Driver.ts";
import { VirtualDisplayDriver } from "./VirtualDisplayDriver.ts";

export function buildComputerUseDrivers(): ReadonlyMap<ComputerUseDriverKind, ComputerUseDriver> {
  const drivers: ReadonlyArray<ComputerUseDriver> = [
    new LinuxDesktopDriver(),
    new VirtualDisplayDriver("container"),
    new VirtualDisplayDriver("browser"),
    new LinuxX11Driver(),
    new LinuxWaylandDriver(),
  ];
  return new Map(drivers.map((driver) => [driver.kind, driver]));
}
