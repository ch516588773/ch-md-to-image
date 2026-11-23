# Markdown 转图片

将当前 Markdown 预览为卡片，并导出 / 复制高清 PNG。支持代码高亮、KaTeX 公式与 Mermaid 图。

## 功能

- 预览面板：调宽度、清晰度倍率（1x / 2x / 3x）、主题、高度模式、内边距、背景色
- 实时显示预计导出像素（约 `宽 × scale` × `高 × scale`）
- 命令：打开预览、导出 PNG、复制图片
- 渲染：GFM 风格 Markdown、Highlight.js、KaTeX、Mermaid、本地相对路径图片

## 使用

1. 打开任意 `.md` 文件
2. 命令面板运行 `Markdown Image: Open Preview`
3. 在工具条调整宽度 / 清晰度后点 **导出 PNG** 或 **复制图片**

也可直接使用：

- `Markdown Image: Export PNG`
- `Markdown Image: Copy Image`

## 设置

| 设置 | 说明 | 默认 |
|------|------|------|
| `markdownImage.width` | 内容 CSS 宽度 | `800` |
| `markdownImage.scale` | 清晰度倍率 1/2/3 | `2` |
| `markdownImage.heightMode` | `auto` 完整高度 / `max` 限高裁切 | `auto` |
| `markdownImage.maxHeight` | `max` 模式下最大 CSS 高度 | `4000` |
| `markdownImage.theme` | `light` / `dark` | `light` |
| `markdownImage.padding` | 内边距 | `32` |
| `markdownImage.background` | 背景色覆盖（空则用主题默认） | `""` |

## 本地开发

```bash
npm install
npm run build
```

在 VS Code / Cursor 中按 F5 启动「运行扩展」调试（见 `.vscode/launch.json`）。

打包：

```bash
npm run package
```

## 发布到 Marketplace（VS Code）

1. 在 [Visual Studio Marketplace 管理页](https://marketplace.visualstudio.com/manage) 创建 Publisher
2. 将 `package.json` 里的 `publisher` 改成你的 Publisher ID
3. 创建 Azure DevOps PAT（Marketplace 权限）
4. 执行：

```bash
npx @vscode/vsce login <publisher>
npx @vscode/vsce publish
```

当前扩展：https://marketplace.visualstudio.com/items?itemName=chtools.ch-md-to-image  
源码仓库：https://github.com/ch516588773/ch-md-to-image

## 发布到 Open VSX（Cursor 可搜索）

Cursor 扩展搜索主要走 [Open VSX](https://open-vsx.org/)，与微软 Marketplace 不是同一套。要让 Cursor 搜到，需再发一份：

1. 注册并登录 [eclipse.org](https://accounts.eclipse.org/)（建议填写与 Open VSX 相同的 GitHub 用户名）
2. 打开 [open-vsx.org](https://open-vsx.org/) → 右上角用 **GitHub** 登录
3. Avatar → **Settings** → **Log in with Eclipse** → 签署 **Publisher Agreement**
4. Settings → **Access Tokens** → **Generate New Token**（只显示一次，自行妥善保存；不要发给他人或贴到聊天）
5. 创建命名空间（需与 `package.json` 的 `publisher` 一致，当前为 `chtools`）：

```bash
npx ovsx create-namespace chtools -p <你的_Open_VSX_Token>
```

6. 发布已有 `.vsix`：

```bash
npx ovsx publish ch-md-to-image-0.1.0.vsix -p <你的_Open_VSX_Token>
```

成功后页面类似：https://open-vsx.org/extension/chtools/ch-md-to-image  
稍等索引更新，再在 Cursor 扩展市场搜索 `ch-md-to-image` 或「Markdown 转图片」。

官方说明：[Publishing Extensions](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)

## 许可

MIT
