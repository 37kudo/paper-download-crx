# paper-download-crx

Chrome 扩展项目骨架。

当前功能：在电子底稿系统的“底稿审核”页面自动新增“下载”和“上传”按钮。

按钮逻辑：

- 已勾选文件时，下载选中的单个文件或批量文件。
- 未勾选文件时，下载左侧当前选中的目录。
- 已勾选文件时，上传选中的底稿文件到本机上传服务。
- 未勾选文件时，上传当前列表全部文件；如果当前列表没有文件，则上传左侧当前选中的目录。

上传服务默认地址：

```text
http://127.0.0.1:8766/upload
```

如果上传服务运行在远程服务器上，在扩展弹窗里把“上传服务地址”改成浏览器可访问的地址，例如：

```text
http://服务器IP:8766/upload
```

启动方式：

```bash
python3 upload-server.py
```

如需让其他电脑访问上传服务，启动时绑定外网地址：

```bash
python3 upload-server.py --host 0.0.0.0 --port 8766
```

默认保存路径：

```text
~/paper-upload-work/uploads/YYYYMMDD_HHMMSS/
```

每次上传会生成一个批次目录，文件保存在批次目录下，并写入 `metadata.json`。

## 结构

- `manifest.json`: 扩展配置
- `background.js`: 后台服务脚本
- `content-script.js`: 向目标页面注入页面脚本
- `injected-page.js`: 新增下载按钮和下载逻辑
- `upload-server.py`: 本机上传接收服务
- `popup.html`: 弹出面板
- `popup.css`: 弹出面板样式
- `popup.js`: 弹出面板逻辑

## 加载方式

在 Chrome 的扩展管理页面中选择“加载已解压的扩展程序”，然后指向这个目录。
