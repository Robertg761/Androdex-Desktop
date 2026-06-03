#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ID="AndrodexComputerUsePlugin"
PLUGIN_SO="AndrodexComputerUsePlugin.so"
KWIN_SERVICE="org.t3tools.Androdex.ComputerUse"
KWIN_OBJECT="/org/t3tools/Androdex/ComputerUse"
KWIN_INTERFACE="org.t3tools.Androdex.ComputerUse1"

ALLOW_SUDO=0
FORCE=0
NO_LOAD=0

usage() {
    cat <<EOF
Usage: $0 [--allow-sudo] [--force] [--no-load]

Builds, installs, enables, and best-effort loads the Androdex KWin computer-use
plugin. The install is skipped when the source and installed KWin signature are
unchanged.

  --allow-sudo  use sudo -n for the final root-owned plugin install path
  --force       rebuild and reinstall even when the signature matches
  --no-load     do not attempt to load the plugin into the current KWin session
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --allow-sudo)
            ALLOW_SUDO=1
            shift
            ;;
        --force)
            FORCE=1
            shift
            ;;
        --no-load)
            NO_LOAD=1
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

log() {
    printf '[androdex-kwin-plugin] %s\n' "$*"
}

need_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

need_command cmake
need_command ninja
need_command qtpaths6
need_command sha256sum
need_command stat
need_command flock

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/androdex/kwin-computer-use-plugin"
STATE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/androdex/kwin-computer-use-plugin"
BUILD_DIR="$CACHE_ROOT/build"
LOCK_FILE="$STATE_ROOT/install.lock"
STAMP_FILE="$STATE_ROOT/install.stamp"
PLUGIN_DIR="$(qtpaths6 --plugin-dir)/kwin/plugins"
INSTALLED_PLUGIN="$PLUGIN_DIR/$PLUGIN_SO"
BUILT_PLUGIN="$BUILD_DIR/kwin/plugins/$PLUGIN_SO"

mkdir -p "$CACHE_ROOT" "$STATE_ROOT"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    log "another rebuild/install is already running"
    exit 0
fi

source_hash() {
    (
        cd "$SOURCE_DIR"
        sha256sum \
            CMakeLists.txt \
            metadata.json \
            main.cpp \
            androdexcomputeruseplugin.h \
            androdexcomputeruseplugin.cpp |
            sha256sum |
            awk '{ print $1 }'
    )
}

path_signature() {
    local path
    for path in \
        /usr/bin/kwin_wayland \
        /usr/lib64/libkwin.so.6 \
        /usr/lib64/cmake/KWin/KWinConfig.cmake \
        /usr/lib64/cmake/KWin/KWinTargets.cmake
    do
        if [[ -e "$path" ]]; then
            printf '%s %s\n' "$path" "$(stat -Lc '%i:%s:%Y' "$path")"
        fi
    done
}

rpm_signature() {
    if command -v rpm >/dev/null 2>&1; then
        rpm -q kwin kwin-libs kwin-devel 2>/dev/null || true
    fi
}

kwin_version() {
    if command -v kwin_wayland >/dev/null 2>&1; then
        kwin_wayland --version 2>/dev/null || true
    fi
}

current_signature_details() {
    printf 'source=%s\n' "$(source_hash)"
    printf 'qt_plugin_dir=%s\n' "$(qtpaths6 --plugin-dir)"
    printf 'kwin_version=%s\n' "$(kwin_version)"
    printf 'rpm_signature<<EOF\n%s\nEOF\n' "$(rpm_signature)"
    printf 'path_signature<<EOF\n%s\nEOF\n' "$(path_signature)"
}

current_signature="$(current_signature_details | sha256sum | awk '{ print $1 }')"
installed_signature=""
if [[ -f "$STAMP_FILE" ]]; then
    installed_signature="$(awk -F= '/^signature=/{ print $2; exit }' "$STAMP_FILE")"
fi

enable_plugin() {
    if command -v kwriteconfig6 >/dev/null 2>&1; then
        kwriteconfig6 --file kwinrc --group Plugins --key "${PLUGIN_ID}Enabled" true || true
    fi
}

load_plugin() {
    if [[ "$NO_LOAD" -eq 1 ]]; then
        return
    fi
    if ! command -v busctl >/dev/null 2>&1; then
        return
    fi

    busctl --user call org.kde.KWin /Plugins org.kde.KWin.Plugins LoadPlugin s "$PLUGIN_ID" >/dev/null 2>&1 || true
    busctl --user call "$KWIN_SERVICE" "$KWIN_OBJECT" "$KWIN_INTERFACE" healthJson >/dev/null 2>&1 || true
}

if [[ "$FORCE" -eq 0 && -f "$INSTALLED_PLUGIN" && "$installed_signature" == "$current_signature" ]]; then
    log "installed plugin is current"
    enable_plugin
    load_plugin
    exit 0
fi

log "building plugin for current KWin installation"
cmake -S "$SOURCE_DIR" -B "$BUILD_DIR" -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build "$BUILD_DIR"

if [[ ! -f "$BUILT_PLUGIN" ]]; then
    echo "Built plugin was not produced at $BUILT_PLUGIN" >&2
    exit 1
fi

log "installing plugin to $INSTALLED_PLUGIN"
if [[ -w "$PLUGIN_DIR" ]]; then
    install -m 755 "$BUILT_PLUGIN" "$INSTALLED_PLUGIN"
elif [[ "$ALLOW_SUDO" -eq 1 ]]; then
    sudo -n install -m 755 "$BUILT_PLUGIN" "$INSTALLED_PLUGIN"
else
    echo "Plugin directory is not writable: $PLUGIN_DIR" >&2
    echo "Re-run with --allow-sudo, or install $BUILT_PLUGIN manually." >&2
    exit 1
fi

enable_plugin

{
    printf 'signature=%s\n' "$current_signature"
    printf 'installed_at=%s\n' "$(date -Is)"
    current_signature_details
} >"$STAMP_FILE"

load_plugin
log "plugin install is current"
