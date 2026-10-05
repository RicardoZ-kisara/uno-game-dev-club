# 牌桌 WebFont

这些字体随应用一起提供，手机访问和局域网断外网游玩时无需连接字体 CDN。

- **Inter**：界面英文、数字和标题，替代仅部分设备具有的 Segoe UI。
- **Noto Sans SC**：中文界面与昵称。按 Unicode 范围分片，浏览器只加载当前文字需要的分片。
- **Roboto Mono**：房间号、座位号、分数等等宽数字，替代 Consolas。

文件来自 Fontsource 的 `@fontsource-variable/inter`、`@fontsource-variable/noto-sans-sc`、`@fontsource-variable/roboto-mono` npm 包，选用 `wght` 变量字体。英文保留 Latin 正体和斜体；中文保留完整分片。

精确版本、文件大小、SHA-256 和来源见 [sources.json](sources.json)。各字体均遵循 SIL Open Font License 1.1，原始许可证保存在同目录的 `*-LICENSE.txt`，未修改字体文件。网页中的字体族别名由 [app/fonts.css](../../app/fonts.css) 定义。

上游：[Inter](https://github.com/rsms/inter)、[Noto CJK](https://github.com/notofonts/noto-cjk)、[Roboto Mono](https://github.com/googlefonts/RobotoMono)。
