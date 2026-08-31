# Freight Toolbox 海运报价工具

基于 Vue 3、TypeScript 和 Vite 的海运报价导入、查询与批量处理工具，可构建为网页版本或 Windows 桌面应用。

源码结构、公司数据隔离方式和隐私文件存放规则，请阅读 [docs/项目结构说明.md](docs/项目结构说明.md)。版本功能见 [CHANGELOG.md](CHANGELOG.md)。

## 当前支持

- 从已适配格式的 LCL Excel 报价表导入数据。
- 每家公司维护独立报价库，互不覆盖。
- 同一公司保存多个报价版本并选择当前版本。
- 按渠道、目的仓代码和计费重量查询 KG 阶梯价。
- 返回系统单价、基础金额、匹配原因和原始单元格位置。
- 批量粘贴数据、计算系统价格并导出 Excel。
- 在当前浏览器本地保存导入结果。

项目不包含真实报价表、客户数据或生产业务数据。附加费、超尺寸费、报关费和尾板费等暂不自动计入。

## 本地启动

```bash
npm install
npm run dev
```

打开终端显示的本地地址。同一局域网设备可使用终端显示的 `Network` 地址访问。

## 网页构建

```bash
npm run build
```

构建结果位于 `dist/`。

## Windows 桌面版

项目已接入 Tauri。首次在 Windows 使用时：

1. 安装 Node.js LTS、Visual Studio C++ Build Tools 和 Rust。
2. 双击 `首次准备Windows环境.bat`。
3. 双击 `预览Windows桌面版.bat` 检查桌面效果。
4. 双击 `生成Windows安装包.bat` 生成安装程序。

安装程序位于：

```text
src-tauri\target\release\bundle\nsis\
```

## 隐私说明

真实报价表、测试数据和客户资料应放在根目录的 `local-resources/` 中。该目录已被 Git 整体忽略，请勿将私密文件移动到源码目录。
