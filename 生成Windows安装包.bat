@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 海运报价查询系统 - 生成安装包

if not exist "node_modules\.bin\tauri.cmd" (
  echo 尚未准备桌面环境，正在打开首次准备脚本...
  call "首次准备Windows环境.bat"
  if errorlevel 1 exit /b 1
)

echo 正在生成 Windows 64 位安装程序，请不要关闭窗口...
call npm run desktop:build
if errorlevel 1 goto failed

echo.
echo 生成成功，安装程序位于：
echo src-tauri\target\release\bundle\nsis
start "" explorer "%~dp0src-tauri\target\release\bundle\nsis"
pause
exit /b 0

:failed
echo 生成失败，请保留窗口中的错误信息。
pause
exit /b 1
