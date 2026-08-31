@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 海运报价查询系统 - 首次准备

echo [1/4] 检查 Node.js...
where node >nul 2>nul
if errorlevel 1 goto node_missing

echo [2/4] 检查 Rust...
where cargo >nul 2>nul
if errorlevel 1 goto rust_missing

echo [3/4] 安装项目依赖...
call npm install
if errorlevel 1 goto failed

echo [4/4] 安装 Tauri 2.11.4 构建工具...
call npm install --save-dev @tauri-apps/cli@2.11.4
if errorlevel 1 goto failed

echo.
echo 准备完成。现在可以双击“预览Windows桌面版.bat”。
pause
exit /b 0

:node_missing
echo 未找到 Node.js。请先安装 Node.js LTS，然后重新打开此脚本。
pause
exit /b 1

:rust_missing
echo 未找到 Rust。请先从 https://rustup.rs 安装 Rust，然后重新打开此脚本。
pause
exit /b 1

:failed
echo 安装失败，请保留窗口中的错误信息。
pause
exit /b 1
