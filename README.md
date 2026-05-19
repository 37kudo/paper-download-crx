# paper-download-crx

Chrome 扩展项目骨架。

当前功能：在电子底稿系统的“底稿审核”页面自动新增“下载增强”按钮。

按钮逻辑：

- 已勾选文件时，下载选中的单个文件或批量文件。
- 未勾选文件时，下载左侧当前选中的目录。

## 结构

- `manifest.json`: 扩展配置
- `background.js`: 后台服务脚本
- `content-script.js`: 向目标页面注入页面脚本
- `injected-page.js`: 新增下载按钮和下载逻辑
- `popup.html`: 弹出面板
- `popup.css`: 弹出面板样式
- `popup.js`: 弹出面板逻辑

## 加载方式

在 Chrome 的扩展管理页面中选择“加载已解压的扩展程序”，然后指向这个目录。
