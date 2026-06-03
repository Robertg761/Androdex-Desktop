cmake_minimum_required(VERSION 3.25)
project(androdexcomputeruse VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(ECM REQUIRED NO_MODULE)
set(CMAKE_MODULE_PATH ${ECM_MODULE_PATH})

include(KDEInstallDirs)
include(KDECompilerSettings NO_POLICY_SCOPE)

find_package(Qt6 REQUIRED COMPONENTS Core DBus Gui Quick Widgets)
find_package(KF6CoreAddons REQUIRED)
find_package(KWin REQUIRED)

add_library(AndrodexComputerUsePlugin MODULE
    androdexcomputeruseplugin.cpp
    androdexcomputeruseplugin.h
    main.cpp
)

target_link_libraries(AndrodexComputerUsePlugin PRIVATE
    KWin::kwin
    KF6::CoreAddons
    Qt6::Core
    Qt6::DBus
    Qt6::Gui
    Qt6::Quick
    Qt6::Widgets
)

set_target_properties(AndrodexComputerUsePlugin PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/kwin/plugins"
    PREFIX ""
)

install(TARGETS AndrodexComputerUsePlugin DESTINATION "${KDE_INSTALL_QTPLUGINDIR}/kwin/plugins")
