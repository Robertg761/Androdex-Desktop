/*
    SPDX-FileCopyrightText: 2026 RobertFedora

    SPDX-License-Identifier: GPL-2.0-or-later
*/

#include "androdexcomputeruseplugin.h"

#include "core/output.h"
#include "cursor.h"
#include "cursorsource.h"
#include "effect/effecthandler.h"
#include "input.h"
#include "keyboard_input.h"
#include "pointer_input.h"
#include "scene/imageitem.h"
#include "scene/itemrenderer.h"
#include "scene/workspacescene.h"
#include "utils/cursortheme.h"
#include "wayland/display.h"
#include "wayland/keyboard.h"
#include "wayland/seat.h"
#include "wayland/surface.h"
#include "wayland_server.h"
#include "window.h"
#include "workspace.h"
#include "xkb.h"

#include <QDBusConnection>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <algorithm>
#include <chrono>

namespace KWin
{

static const QString s_service = QStringLiteral("org.t3tools.Androdex.ComputerUse");
static const QString s_path = QStringLiteral("/org/t3tools/Androdex/ComputerUse");
static const QString s_interface = QStringLiteral("org.t3tools.Androdex.ComputerUse1");
static const QString s_agentCursorName = QStringLiteral("androdex-agent");
static const QString s_eventSeatName = QStringLiteral("kwin-compositor");

static QJsonObject pointToJson(const QPointF &point)
{
    return {
        {QStringLiteral("x"), point.x()},
        {QStringLiteral("y"), point.y()},
    };
}

static QJsonObject rectToJson(const RectF &rect)
{
    return {
        {QStringLiteral("x"), rect.x()},
        {QStringLiteral("y"), rect.y()},
        {QStringLiteral("width"), rect.width()},
        {QStringLiteral("height"), rect.height()},
    };
}

AndrodexAgentCursorItem::AndrodexAgentCursorItem(Item *parent)
    : Item(parent)
{
    m_source = std::make_unique<ShapeCursorSource>();
    m_source->setTheme(input()->pointer()->cursorTheme());
    m_source->setShape(Qt::ArrowCursor);

    refresh();
    connect(m_source.get(), &CursorSource::changed, this, &AndrodexAgentCursorItem::refresh);
}

void AndrodexAgentCursorItem::refresh()
{
    if (!m_imageItem) {
        m_imageItem = scene()->renderer()->createImageItem(this);
    }
    m_imageItem->setImage(m_source->image());
    m_imageItem->setPosition(-m_source->hotspot());
    m_imageItem->setSize(m_source->image().deviceIndependentSize());
}

AndrodexComputerUsePlugin::AndrodexComputerUsePlugin()
    : Plugin()
    , m_pos(Cursors::self()->mouse()->pos())
{
    ensureSeat();
    ensureCursorItem();
    setCursorVisible(false);

    QDBusConnection::sessionBus().registerService(s_service);
    QDBusConnection::sessionBus().registerObject(s_path, s_interface, this, QDBusConnection::ExportAllInvokables);
}

AndrodexComputerUsePlugin::~AndrodexComputerUsePlugin()
{
    releasePressedState();
    if (m_seat) {
        m_seat->notifyPointerLeave();
        m_seat->setFocusedKeyboardSurface(nullptr);
    }
    QDBusConnection::sessionBus().unregisterObject(s_path);
    QDBusConnection::sessionBus().unregisterService(s_service);
}

QString AndrodexComputerUsePlugin::toJson(const QJsonObject &object)
{
    return QString::fromUtf8(QJsonDocument(object).toJson(QJsonDocument::Compact));
}

QString AndrodexComputerUsePlugin::toJson(const QJsonArray &array)
{
    return QString::fromUtf8(QJsonDocument(array).toJson(QJsonDocument::Compact));
}

QString AndrodexComputerUsePlugin::healthJson() const
{
    return toJson({
        {QStringLiteral("ok"), bool(m_seat)},
        {QStringLiteral("running"), m_running},
        {QStringLiteral("service"), s_service},
        {QStringLiteral("path"), s_path},
        {QStringLiteral("interface"), s_interface},
        {QStringLiteral("seat"), s_agentCursorName},
        {QStringLiteral("eventSeat"), s_eventSeatName},
        {QStringLiteral("overlay"), bool(m_cursorItem)},
        {QStringLiteral("workspace"), Workspace::self() != nullptr},
        {QStringLiteral("effects"), effects != nullptr},
    });
}

QString AndrodexComputerUsePlugin::stateJson() const
{
    QJsonObject state{
        {QStringLiteral("running"), m_running},
        {QStringLiteral("seat"), s_agentCursorName},
        {QStringLiteral("eventSeat"), s_eventSeatName},
        {QStringLiteral("position"), pointToJson(m_pos)},
        {QStringLiteral("pressedButtonCount"), m_pressedButtons.size()},
        {QStringLiteral("pressedKeyCount"), m_pressedKeys.size()},
    };
    if (m_pointerWindow) {
        state.insert(QStringLiteral("pointerWindowId"), m_pointerWindow->internalId().toString(QUuid::WithoutBraces));
        state.insert(QStringLiteral("pointerWindowTitle"), m_pointerWindow->caption());
    }
    if (m_keyboardWindow) {
        state.insert(QStringLiteral("keyboardWindowId"), m_keyboardWindow->internalId().toString(QUuid::WithoutBraces));
        state.insert(QStringLiteral("keyboardWindowTitle"), m_keyboardWindow->caption());
    }
    if (m_targetWindow) {
        state.insert(QStringLiteral("targetWindowId"), m_targetWindow->internalId().toString(QUuid::WithoutBraces));
        state.insert(QStringLiteral("targetWindowTitle"), m_targetWindow->caption());
    }
    return toJson(state);
}

QString AndrodexComputerUsePlugin::windowsJson() const
{
    QJsonArray windows;
    if (!Workspace::self()) {
        return toJson(windows);
    }

    const QList<Window *> stacking = Workspace::self()->stackingOrder();
    for (Window *window : stacking) {
        if (!window || window->isDeleted() || !window->isClient()) {
            continue;
        }

        const bool visible = usableWindow(window);
        QJsonObject object{
            {QStringLiteral("id"), window->internalId().toString(QUuid::WithoutBraces)},
            {QStringLiteral("title"), window->caption()},
            {QStringLiteral("appId"), window->desktopFileName().isEmpty() ? window->resourceClass() : window->desktopFileName()},
            {QStringLiteral("resourceClass"), window->resourceClass()},
            {QStringLiteral("pid"), int(window->pid())},
            {QStringLiteral("bounds"), rectToJson(window->frameGeometry())},
            {QStringLiteral("visible"), visible},
            {QStringLiteral("focusable"), window->wantsInput()},
            {QStringLiteral("normal"), window->isNormalWindow()},
            {QStringLiteral("desktop"), window->isDesktop()},
            {QStringLiteral("dock"), window->isDock()},
            {QStringLiteral("minimized"), window->isMinimized()},
        };
        windows.append(object);
    }
    return toJson(windows);
}

bool AndrodexComputerUsePlugin::start()
{
    ensureSeat();
    if (!m_seat) {
        return false;
    }
    m_running = true;
    setCursorVisible(true);
    movePointer(m_pos.x(), m_pos.y());
    return true;
}

bool AndrodexComputerUsePlugin::stop()
{
    releasePressedState();
    if (m_seat) {
        m_seat->notifyPointerLeave();
        m_seat->setFocusedKeyboardSurface(nullptr);
    }
    m_pointerWindow.clear();
    m_keyboardWindow.clear();
    m_running = false;
    setCursorVisible(false);
    return true;
}

bool AndrodexComputerUsePlugin::focusWindow(const QString &windowId)
{
    Window *window = findWindowById(windowId);
    if (!usableWindow(window)) {
        return false;
    }
    m_targetWindow = window;
    updatePointerFocus();
    updateKeyboardFocus();
    return true;
}

bool AndrodexComputerUsePlugin::clearFocusWindow()
{
    m_targetWindow.clear();
    updatePointerFocus();
    updateKeyboardFocus();
    return true;
}

bool AndrodexComputerUsePlugin::movePointer(double x, double y)
{
    ensureSeat();
    if (!m_seat) {
        return false;
    }

    m_pos = confinedPoint(QPointF(x, y));
    ensureCursorItem();
    if (m_cursorItem) {
        m_cursorItem->setPosition(m_pos);
    }

    setTimestampNow();
    updatePointerFocus();
    m_seat->notifyPointerFrame();
    return true;
}

bool AndrodexComputerUsePlugin::button(uint button, bool pressed)
{
    ensureSeat();
    if (!m_seat) {
        return false;
    }
    if (!updatePointerFocus()) {
        return false;
    }
    updateKeyboardFocus();

    const auto state = pressed ? PointerButtonState::Pressed : PointerButtonState::Released;
    if (pressed) {
        m_pressedButtons.insert(button);
    } else {
        m_pressedButtons.remove(button);
    }

    setTimestampNow();
    m_seat->notifyPointerButton(button, state);
    m_seat->notifyPointerFrame();
    return true;
}

bool AndrodexComputerUsePlugin::axis(double horizontal, double vertical)
{
    ensureSeat();
    if (!m_seat) {
        return false;
    }
    if (!updatePointerFocus()) {
        return false;
    }

    setTimestampNow();
    if (horizontal != 0) {
        m_seat->notifyPointerAxis(Qt::Horizontal, horizontal * 15.0 / 120.0, int(horizontal), PointerAxisSource::Wheel);
    }
    if (vertical != 0) {
        m_seat->notifyPointerAxis(Qt::Vertical, vertical * 15.0 / 120.0, int(vertical), PointerAxisSource::Wheel);
    }
    m_seat->notifyPointerFrame();
    return true;
}

bool AndrodexComputerUsePlugin::key(uint keyCode, bool pressed)
{
    ensureSeat();
    if (!m_seat || !input() || !input()->keyboard()) {
        return false;
    }
    if (!updateKeyboardFocus()) {
        return false;
    }

    const auto state = pressed ? KeyboardKeyState::Pressed : KeyboardKeyState::Released;
    if (pressed) {
        if (!m_pressedKeys.contains(keyCode)) {
            m_pressedKeys.append(keyCode);
        }
    } else {
        m_pressedKeys.removeOne(keyCode);
    }

    setTimestampNow();
    input()->keyboard()->processKey(
        keyCode,
        state,
        std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now().time_since_epoch()),
        nullptr);
    return true;
}

void AndrodexComputerUsePlugin::ensureSeat()
{
    if (m_seat || !waylandServer()) {
        return;
    }

    m_seat = waylandServer()->seat();
    if (!m_seat) {
        return;
    }

    input()->keyboard()->xkb()->forwardModifiers();
}

void AndrodexComputerUsePlugin::ensureCursorItem()
{
    if (m_cursorItem || !effects || !effects->scene()) {
        return;
    }

    m_cursorItem = std::make_unique<AndrodexAgentCursorItem>(effects->scene()->overlayItem());
    m_cursorItem->setZ(1000);
    m_cursorItem->setPosition(m_pos);
    m_cursorItem->setVisible(m_running);
}

void AndrodexComputerUsePlugin::setCursorVisible(bool visible)
{
    ensureCursorItem();
    if (m_cursorItem) {
        m_cursorItem->setVisible(visible);
    }
}

QPointF AndrodexComputerUsePlugin::confinedPoint(const QPointF &point) const
{
    if (!Workspace::self()) {
        return point;
    }
    LogicalOutput *output = Workspace::self()->outputAt(point);
    if (!output) {
        return point;
    }
    const RectF geometry = output->geometryF();
    return QPointF(std::clamp(point.x(), geometry.x(), geometry.x() + geometry.width() - 1),
                   std::clamp(point.y(), geometry.y(), geometry.y() + geometry.height() - 1));
}

Window *AndrodexComputerUsePlugin::windowAt(const QPointF &point) const
{
    if (!Workspace::self()) {
        return nullptr;
    }

    const QList<Window *> stacking = Workspace::self()->stackingOrder();
    auto it = stacking.end();
    while (it != stacking.begin()) {
        --it;
        Window *window = *it;
        if (!usableWindow(window)) {
            continue;
        }
        if (window->hitTest(point)) {
            return window;
        }
    }
    return nullptr;
}

Window *AndrodexComputerUsePlugin::findWindowById(const QString &windowId) const
{
    if (!Workspace::self()) {
        return nullptr;
    }
    return Workspace::self()->findWindow([&windowId](const Window *window) {
        return window->internalId().toString(QUuid::WithoutBraces) == windowId
            || window->internalId().toString() == windowId;
    });
}

bool AndrodexComputerUsePlugin::usableWindow(const Window *window) const
{
    return window
        && !window->isDeleted()
        && window->isClient()
        && window->surface()
        && window->surface()->isMapped()
        && window->isOnCurrentActivity()
        && window->isOnCurrentDesktop()
        && !window->isMinimized()
        && !window->isHidden()
        && !window->isHiddenByShowDesktop()
        && window->readyForPainting()
        && window->wantsInput();
}

bool AndrodexComputerUsePlugin::updatePointerFocus()
{
    Window *window = nullptr;
    if (usableWindow(m_targetWindow) && m_targetWindow->hitTest(m_pos)) {
        window = m_targetWindow;
    } else {
        window = windowAt(m_pos);
    }

    if (!window) {
        if (m_pointerWindow && m_seat) {
            m_seat->notifyPointerLeave();
        }
        m_pointerWindow.clear();
        return false;
    }

    if (m_pointerWindow == window) {
        m_seat->notifyPointerMotion(m_pos);
        return true;
    }

    if (m_pointerWindow) {
        m_seat->notifyPointerLeave();
    }
    m_pointerWindow = window;
    m_seat->notifyPointerEnter(window->surface(), m_pos, window->inputTransformation());
    return true;
}

bool AndrodexComputerUsePlugin::updateKeyboardFocus()
{
    Window *window = nullptr;
    if (usableWindow(m_targetWindow)) {
        window = m_targetWindow;
    } else if (usableWindow(m_pointerWindow)) {
        window = m_pointerWindow;
    } else {
        window = windowAt(m_pos);
    }

    if (!window || !m_seat) {
        return false;
    }
    if (m_keyboardWindow == window) {
        return true;
    }

    m_keyboardWindow = window;
    m_seat->setFocusedKeyboardSurface(window->surface(), m_pressedKeys);
    return true;
}

void AndrodexComputerUsePlugin::releasePressedState()
{
    if (!m_seat) {
        return;
    }

    const auto buttons = m_pressedButtons.values();
    for (quint32 button : buttons) {
        this->button(button, false);
    }
    const auto keys = m_pressedKeys;
    for (auto it = keys.crbegin(); it != keys.crend(); ++it) {
        this->key(*it, false);
    }
}

void AndrodexComputerUsePlugin::setTimestampNow()
{
    if (!m_seat) {
        return;
    }
    m_seat->setTimestamp(std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now().time_since_epoch()));
}

} // namespace KWin

#include "moc_androdexcomputeruseplugin.cpp"
