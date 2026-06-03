export const LINUX_X11_MPX_HELPER_SOURCE = String.raw`#!/usr/bin/env python3
import argparse
import ctypes
import ctypes.util
import json
import sys
import time

XI_ADD_MASTER = 1
XI_REMOVE_MASTER = 2
XI_FLOATING = 2
XI_ALL_DEVICES = 0
XI_ALL_MASTER_DEVICES = 1
XI_MASTER_POINTER = 1
XI_MASTER_KEYBOARD = 2
XI_SLAVE_POINTER = 3
XI_SLAVE_KEYBOARD = 4
CURRENT_TIME = 0
NONE = 0


def load_library(name, soname):
    path = ctypes.util.find_library(name) or soname
    return ctypes.CDLL(path)


x11 = load_library("X11", "libX11.so.6")
xi = load_library("Xi", "libXi.so.6")
xtst = load_library("Xtst", "libXtst.so.6")

x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
x11.XCloseDisplay.restype = ctypes.c_int
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XSync.restype = ctypes.c_int
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint


class XIAddMasterInfo(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("name", ctypes.c_char_p),
        ("send_core", ctypes.c_int),
        ("enable", ctypes.c_int),
    ]


class XIRemoveMasterInfo(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("deviceid", ctypes.c_int),
        ("return_mode", ctypes.c_int),
        ("return_pointer", ctypes.c_int),
        ("return_keyboard", ctypes.c_int),
    ]


class XIAnyHierarchyChangeInfo(ctypes.Union):
    _fields_ = [
        ("type", ctypes.c_int),
        ("add", XIAddMasterInfo),
        ("remove", XIRemoveMasterInfo),
    ]


class XIDeviceInfo(ctypes.Structure):
    _fields_ = [
        ("deviceid", ctypes.c_int),
        ("name", ctypes.c_char_p),
        ("use", ctypes.c_int),
        ("attachment", ctypes.c_int),
        ("enabled", ctypes.c_int),
        ("num_classes", ctypes.c_int),
        ("classes", ctypes.c_void_p),
    ]


xi.XIQueryVersion.argtypes = [
    ctypes.c_void_p,
    ctypes.POINTER(ctypes.c_int),
    ctypes.POINTER(ctypes.c_int),
]
xi.XIQueryVersion.restype = ctypes.c_int
xi.XIQueryDevice.argtypes = [
    ctypes.c_void_p,
    ctypes.c_int,
    ctypes.POINTER(ctypes.c_int),
]
xi.XIQueryDevice.restype = ctypes.POINTER(XIDeviceInfo)
xi.XIFreeDeviceInfo.argtypes = [ctypes.POINTER(XIDeviceInfo)]
xi.XIChangeHierarchy.argtypes = [
    ctypes.c_void_p,
    ctypes.POINTER(XIAnyHierarchyChangeInfo),
    ctypes.c_int,
]
xi.XIChangeHierarchy.restype = ctypes.c_int
xi.XIWarpPointer.argtypes = [
    ctypes.c_void_p,
    ctypes.c_int,
    ctypes.c_ulong,
    ctypes.c_ulong,
    ctypes.c_double,
    ctypes.c_double,
    ctypes.c_uint,
    ctypes.c_uint,
    ctypes.c_double,
    ctypes.c_double,
]
xi.XIWarpPointer.restype = ctypes.c_int
xi.XISetFocus.argtypes = [
    ctypes.c_void_p,
    ctypes.c_int,
    ctypes.c_ulong,
    ctypes.c_ulong,
]
xi.XISetFocus.restype = ctypes.c_int
xi.XOpenDevice.argtypes = [ctypes.c_void_p, ctypes.c_int]
xi.XOpenDevice.restype = ctypes.c_void_p
xi.XCloseDevice.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
xi.XCloseDevice.restype = ctypes.c_int

xtst.XTestQueryExtension.argtypes = [
    ctypes.c_void_p,
    ctypes.POINTER(ctypes.c_int),
    ctypes.POINTER(ctypes.c_int),
    ctypes.POINTER(ctypes.c_int),
    ctypes.POINTER(ctypes.c_int),
]
xtst.XTestQueryExtension.restype = ctypes.c_int
xtst.XTestFakeDeviceButtonEvent.argtypes = [
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_uint,
    ctypes.c_int,
    ctypes.POINTER(ctypes.c_int),
    ctypes.c_int,
    ctypes.c_ulong,
]
xtst.XTestFakeDeviceButtonEvent.restype = ctypes.c_int
xtst.XTestFakeDeviceKeyEvent.argtypes = [
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_uint,
    ctypes.c_int,
    ctypes.POINTER(ctypes.c_int),
    ctypes.c_int,
    ctypes.c_ulong,
]
xtst.XTestFakeDeviceKeyEvent.restype = ctypes.c_int


def fail(message):
    print(json.dumps({"ok": False, "error": message}))
    raise SystemExit(1)


def open_display(display_name):
    encoded = display_name.encode() if display_name else None
    dpy = x11.XOpenDisplay(encoded)
    if not dpy:
        fail("Unable to open X11 display.")
    return dpy


def query_versions(dpy):
    xi_major = ctypes.c_int(2)
    xi_minor = ctypes.c_int(0)
    if xi.XIQueryVersion(dpy, ctypes.byref(xi_major), ctypes.byref(xi_minor)) != 0:
        fail("XInput2 is not available.")
    event_base = ctypes.c_int()
    error_base = ctypes.c_int()
    xtest_major = ctypes.c_int()
    xtest_minor = ctypes.c_int()
    if (
        xtst.XTestQueryExtension(
            dpy,
            ctypes.byref(event_base),
            ctypes.byref(error_base),
            ctypes.byref(xtest_major),
            ctypes.byref(xtest_minor),
        )
        == 0
    ):
        fail("XTEST is not available.")
    return {
        "xiVersion": f"{xi_major.value}.{xi_minor.value}",
        "xtestVersion": f"{xtest_major.value}.{xtest_minor.value}",
    }


def all_devices(dpy, selector=XI_ALL_DEVICES):
    count = ctypes.c_int()
    infos = xi.XIQueryDevice(dpy, selector, ctypes.byref(count))
    if not infos:
        fail("Unable to query XInput devices.")
    devices = []
    try:
        for index in range(count.value):
            info = infos[index]
            name = info.name.decode(errors="replace") if info.name else ""
            devices.append(
                {
                    "id": info.deviceid,
                    "name": name,
                    "use": info.use,
                    "attachment": info.attachment,
                    "enabled": bool(info.enabled),
                }
            )
    finally:
        xi.XIFreeDeviceInfo(infos)
    return devices


def find_session_devices(dpy, name):
    pointer = None
    keyboard = None
    xtest_pointer = None
    xtest_keyboard = None
    for device in all_devices(dpy):
        if device["name"] == f"{name} pointer" and device["use"] == XI_MASTER_POINTER:
            pointer = device
        elif device["name"] == f"{name} keyboard" and device["use"] == XI_MASTER_KEYBOARD:
            keyboard = device
        elif device["name"] == f"{name} XTEST pointer" and device["use"] == XI_SLAVE_POINTER:
            xtest_pointer = device
        elif device["name"] == f"{name} XTEST keyboard" and device["use"] == XI_SLAVE_KEYBOARD:
            xtest_keyboard = device
    if not pointer or not keyboard or not xtest_pointer or not xtest_keyboard:
        return None
    return {
        "name": name,
        "pointerId": pointer["id"],
        "keyboardId": keyboard["id"],
        "xtestPointerId": xtest_pointer["id"],
        "xtestKeyboardId": xtest_keyboard["id"],
    }


def create_session(dpy, name):
    change = XIAnyHierarchyChangeInfo()
    change.add = XIAddMasterInfo(XI_ADD_MASTER, name.encode(), 1, 1)
    if xi.XIChangeHierarchy(dpy, ctypes.byref(change), 1) != 0:
        fail("Unable to create XInput master pointer.")
    x11.XSync(dpy, 0)
    for _ in range(20):
        devices = find_session_devices(dpy, name)
        if devices:
            return devices
        time.sleep(0.05)
    fail("Created XInput master, but paired XTEST devices did not appear.")


def remove_session(dpy, pointer_id):
    change = XIAnyHierarchyChangeInfo()
    change.remove = XIRemoveMasterInfo(XI_REMOVE_MASTER, pointer_id, XI_FLOATING, 0, 0)
    if xi.XIChangeHierarchy(dpy, ctypes.byref(change), 1) != 0:
        fail("Unable to remove XInput master pointer.")
    x11.XSync(dpy, 0)
    return {"removed": True}


def parse_window_id(value):
    text = str(value).strip().lower()
    if text.startswith("0x"):
        return int(text, 16)
    return int(text, 10)


def open_device(dpy, device_id):
    device = xi.XOpenDevice(dpy, device_id)
    if not device:
        fail(f"Unable to open XInput device {device_id}.")
    return device


def warp(dpy, pointer_id, window_id, x, y):
    if xi.XIWarpPointer(dpy, pointer_id, NONE, window_id, 0, 0, 0, 0, x, y) != 0:
        fail("Unable to move the agent pointer.")
    x11.XSync(dpy, 0)


def button_number(name):
    if name == "right":
        return 3
    if name == "middle":
        return 2
    return 1


def fake_button(dpy, xtest_pointer_id, button, pressed):
    device = open_device(dpy, xtest_pointer_id)
    try:
        if xtst.XTestFakeDeviceButtonEvent(dpy, device, button, 1 if pressed else 0, None, 0, 0) == 0:
            fail("Unable to emit pointer button event.")
        x11.XSync(dpy, 0)
    finally:
        xi.XCloseDevice(dpy, device)


KEYSYM_NAMES = {
    "alt": "Alt_L",
    "backspace": "BackSpace",
    "cmd": "Control_L",
    "command": "Control_L",
    "control": "Control_L",
    "ctrl": "Control_L",
    "delete": "Delete",
    "down": "Down",
    "end": "End",
    "enter": "Return",
    "esc": "Escape",
    "escape": "Escape",
    "home": "Home",
    "left": "Left",
    "meta": "Super_L",
    "option": "Alt_L",
    "pagedown": "Page_Down",
    "pageup": "Page_Up",
    "return": "Return",
    "right": "Right",
    "shift": "Shift_L",
    "space": "space",
    "super": "Super_L",
    "tab": "Tab",
    "up": "Up",
}

for index in range(1, 13):
    KEYSYM_NAMES[f"f{index}"] = f"F{index}"


def keycode_for(dpy, key):
    lowered = key.lower()
    keysym_name = KEYSYM_NAMES.get(lowered, key if len(key) == 1 else lowered)
    keysym = x11.XStringToKeysym(keysym_name.encode())
    if keysym == 0 and len(key) == 1:
        keysym = x11.XStringToKeysym(key.upper().encode())
    if keysym == 0:
        fail(f"Unsupported key: {key}")
    keycode = x11.XKeysymToKeycode(dpy, keysym)
    if keycode == 0:
        fail(f"No keycode for key: {key}")
    return keycode


def fake_key(dpy, xtest_keyboard_id, keycode, pressed):
    device = open_device(dpy, xtest_keyboard_id)
    try:
        if xtst.XTestFakeDeviceKeyEvent(dpy, device, keycode, 1 if pressed else 0, None, 0, 0) == 0:
            fail("Unable to emit keyboard event.")
        x11.XSync(dpy, 0)
    finally:
        xi.XCloseDevice(dpy, device)


def key_sequence(dpy, keyboard_id, xtest_keyboard_id, window_id, keys):
    if xi.XISetFocus(dpy, keyboard_id, window_id, CURRENT_TIME) != 0:
        fail("Unable to focus target window for agent keyboard.")
    x11.XSync(dpy, 0)
    keycodes = [keycode_for(dpy, key) for key in keys]
    for keycode in keycodes:
        fake_key(dpy, xtest_keyboard_id, keycode, True)
    for keycode in reversed(keycodes):
        fake_key(dpy, xtest_keyboard_id, keycode, False)


def scroll_count(delta):
    if delta == 0:
        return 0
    return max(1, min(12, int((abs(delta) + 119) / 120)))


def execute_action(dpy, args, action):
    window_id = parse_window_id(args.window_id)
    pointer_id = int(args.pointer_id)
    keyboard_id = int(args.keyboard_id)
    xtest_pointer_id = int(args.xtest_pointer_id)
    xtest_keyboard_id = int(args.xtest_keyboard_id)
    kind = action.get("type")
    if kind == "move":
        warp(dpy, pointer_id, window_id, action["x"], action["y"])
    elif kind == "click":
        warp(dpy, pointer_id, window_id, action["x"], action["y"])
        button = button_number(action.get("button", "left"))
        fake_button(dpy, xtest_pointer_id, button, True)
        fake_button(dpy, xtest_pointer_id, button, False)
    elif kind == "double_click":
        warp(dpy, pointer_id, window_id, action["x"], action["y"])
        for _ in range(2):
            fake_button(dpy, xtest_pointer_id, 1, True)
            fake_button(dpy, xtest_pointer_id, 1, False)
            time.sleep(0.05)
    elif kind == "drag":
        path = action.get("path", [])
        if len(path) == 0:
            return {"executed": True}
        first = path[0]
        warp(dpy, pointer_id, window_id, first["x"], first["y"])
        fake_button(dpy, xtest_pointer_id, 1, True)
        for point in path[1:]:
            warp(dpy, pointer_id, window_id, point["x"], point["y"])
            time.sleep(0.01)
        fake_button(dpy, xtest_pointer_id, 1, False)
    elif kind == "scroll":
        warp(dpy, pointer_id, window_id, action["x"], action["y"])
        scroll_y = action.get("scrollY", 0) or 0
        scroll_x = action.get("scrollX", 0) or 0
        for _ in range(scroll_count(scroll_y)):
            fake_button(dpy, xtest_pointer_id, 5 if scroll_y > 0 else 4, True)
            fake_button(dpy, xtest_pointer_id, 5 if scroll_y > 0 else 4, False)
        for _ in range(scroll_count(scroll_x)):
            fake_button(dpy, xtest_pointer_id, 7 if scroll_x > 0 else 6, True)
            fake_button(dpy, xtest_pointer_id, 7 if scroll_x > 0 else 6, False)
    elif kind == "keypress":
        key_sequence(dpy, keyboard_id, xtest_keyboard_id, window_id, action["keys"])
    else:
        fail(f"Unsupported helper action: {kind}")
    return {"executed": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["probe", "create", "remove", "action"])
    parser.add_argument("--display", default=None)
    parser.add_argument("--name")
    parser.add_argument("--pointer-id")
    parser.add_argument("--keyboard-id")
    parser.add_argument("--xtest-pointer-id")
    parser.add_argument("--xtest-keyboard-id")
    parser.add_argument("--window-id")
    parser.add_argument("--action-json")
    args = parser.parse_args()
    dpy = open_display(args.display)
    try:
        versions = query_versions(dpy)
        if args.command == "probe":
            result = {"ok": True, **versions}
        elif args.command == "create":
            if not args.name:
                fail("Missing session name.")
            result = {"ok": True, **create_session(dpy, args.name)}
        elif args.command == "remove":
            if not args.pointer_id:
                fail("Missing pointer id.")
            result = {"ok": True, **remove_session(dpy, int(args.pointer_id))}
        else:
            if not args.action_json:
                fail("Missing action JSON.")
            action = json.loads(args.action_json)
            result = {"ok": True, **execute_action(dpy, args, action)}
        print(json.dumps(result))
    finally:
        x11.XCloseDisplay(dpy)


if __name__ == "__main__":
    main()
`;
