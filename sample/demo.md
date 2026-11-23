# Markdown to Image

把这份文档导出成 PNG，检查宽度、清晰度与进阶渲染。

## 列表与引用

- 支持 **粗体**、*斜体*、`行内代码`
- 本地相对路径图片与表格

> 预览条可调 Width / Scale，右上角会显示预计导出像素。

## 代码

```ts
function greet(name: string) {
  return `Hello, ${name}!`;
}
```

## 公式

行内公式 $E = mc^2$，块级：

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

## Mermaid

```mermaid
flowchart LR
  md[Markdown] --> preview[Webview Preview]
  preview --> png[PNG Export]
```

## 表格

| 项 | 值 |
|----|----|
| width | 800 |
| scale | 2 |
| 导出宽 | ≈ 1600px |
