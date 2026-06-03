# Androdex KWin Computer Use Plugin

This plugin gives the Linux Wayland driver native KWin integration. It paints a
separate visible cursor named `androdex-agent`, routes events through KWin's
compositor seat so existing Wayland clients receive them, and exposes a small
D-Bus API used by `LinuxWaylandDriver`.

The plugin is intentionally KWin-specific. Generic Wayland clients cannot inject
input into other native Wayland clients with an independent cursor; that requires
compositor integration.

## Build and install on Fedora KDE

Install the build dependencies:

```sh
sudo dnf -y --setopt=install_weak_deps=False install \
  cmake extra-cmake-modules kwin-devel kf6-kcoreaddons-devel \
  qt6-qtbase-devel libepoxy-devel libdrm-devel
```

Build from the repository root:

```sh
cmake -S apps/server/src/computerUse/kwin/androdexcomputeruse \
  -B /tmp/androdex-kwin-plugin-build \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build /tmp/androdex-kwin-plugin-build
```

Install and load into the running KWin session:

```sh
sudo install -m 755 \
  /tmp/androdex-kwin-plugin-build/kwin/plugins/AndrodexComputerUsePlugin.so \
  /usr/lib64/qt6/plugins/kwin/plugins/AndrodexComputerUsePlugin.so
busctl --user call org.kde.KWin /Plugins org.kde.KWin.Plugins LoadPlugin s AndrodexComputerUsePlugin
```

Check health:

```sh
busctl --user call org.t3tools.Androdex.ComputerUse \
  /org/t3tools/Androdex/ComputerUse \
  org.t3tools.Androdex.ComputerUse1 healthJson
```

## Automatic rebuild after KWin upgrades

`install-and-enable.sh` is idempotent. It hashes the plugin source, the current
KWin package/signature, and the Qt plugin path. If that signature is unchanged
and the plugin is installed, it only ensures the KWin plugin is enabled.

Run once manually:

```sh
apps/server/src/computerUse/kwin/androdexcomputeruse/install-and-enable.sh --allow-sudo
```

For this Fedora KDE workstation, the user systemd units in `systemd/` run the
same installer after login, every six hours, and when KWin ABI files change:

```sh
systemctl --user link \
  "$PWD/apps/server/src/computerUse/kwin/androdexcomputeruse/systemd/androdex-kwin-computer-use-rebuild.service" \
  "$PWD/apps/server/src/computerUse/kwin/androdexcomputeruse/systemd/androdex-kwin-computer-use-rebuild.path" \
  "$PWD/apps/server/src/computerUse/kwin/androdexcomputeruse/systemd/androdex-kwin-computer-use-rebuild.timer"
systemctl --user enable --now \
  androdex-kwin-computer-use-rebuild.path \
  androdex-kwin-computer-use-rebuild.timer
```

The unattended reinstall uses `sudo -n install` only for the final copy into the
system Qt plugin directory. On a system where that path is not user-writable, add
a narrow sudoers rule for that exact install command.
