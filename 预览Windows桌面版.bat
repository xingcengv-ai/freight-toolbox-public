@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 海运报价查询系统 - 桌面预览

if not exist "node_modules\.bin\tauri.cmd" (
  echo 尚未准备桌面环境，正在打开首次准备脚本...
  call "首次准备Windows环境.bat"
  if errorlevel 1 exit /b 1
)

echo 正在启动桌面预览，首次编译可能需要几分钟...
call npm run desktop:dev
if errorlevel 1 (
  echo 启动失败，请查看上方错误信息。
  pause
)
