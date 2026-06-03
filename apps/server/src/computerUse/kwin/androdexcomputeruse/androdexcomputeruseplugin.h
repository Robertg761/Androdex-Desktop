/*
    SPDX-FileCopyrightText: 2026 RobertFedora

    SPDX-License-Identifier: GPL-2.0-or-later
*/

#pragma once

#include "plugin.h"
#include "scene/item.h"

#include <QDBusContext>
#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QPointer>
#include <QPointF>
#include <QSet>

#include <memory>

namespace KWin
{

class ImageItem;
class SeatInterface;
class ShapeCursorSource;
class Window;
class Xkb;

class AndrodexAgentCursorItem : public Item
{
    Q_OBJECT

public:
    explicit AndrodexAgentCursorItem(Item *parent);

private:
    void refresh();

    std::unique_ptr<ImageItem> m_imageItem;
    std::unique_ptr<ShapeCursorSource> m_source;
};

class AndrodexComputerUsePlugin : public Plugin, public QDBusContext
{
    Q_OBJECT

public:
    explicit AndrodexComputerUsePlugin();
    ~AndrodexComputerUsePlugin() override;

    Q_INVOKABLE QString healthJson() const;
    Q_INVOKABLE QString stateJson() const;
    Q_INVOKABLE QString windowsJson() const;
    Q_INVOKABLE bool start();
    Q_INVOKABLE bool stop();
    Q_INVOKABLE bool focusWindow(const QString &windowId);
    Q_INVOKABLE bool clearFocusWindow();
    Q_INVOKABLE bool movePointer(double x, double y);
    Q_INVOKABLE bool button(uint button, bool pressed);
    Q_INVOKABLE bool axis(double horizontal, double vertical);
    Q_INVOKABLE bool key(uint keyCode, bool pressed);

private:
    static QString toJson(const QJsonObject &object);
    static QString toJson(const QJsonArray &array);

    void ensureSeat();
    void ensureCursorItem();
    void setCursorVisible(bool visible);
    QPointF confinedPoint(const QPointF &point) const;
    Window *windowAt(const QPointF &point) const;
    Window *findWindowById(const QString &windowId) const;
    bool usableWindow(const Window *window) const;
    bool updatePointerFocus();
    bool updateKeyboardFocus();
    void releasePressedState();
    void setTimestampNow();

    bool m_running = false;
    QPointF m_pos;
    QPointer<Window> m_pointerWindow;
    QPointer<Window> m_keyboardWindow;
    QPointer<Window> m_targetWindow;
    std::unique_ptr<SeatInterface> m_seat;
    std::unique_ptr<Xkb> m_xkb;
    std::unique_ptr<AndrodexAgentCursorItem> m_cursorItem;
    QList<quint32> m_pressedKeys;
    QSet<quint32> m_pressedButtons;
};

} // namespace KWin
