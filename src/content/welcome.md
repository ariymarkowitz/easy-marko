<p><img src="/welcome-banner.svg" alt="A tiling of the Easy Marko E and M at different rotations" width="720" height="144"></p>

# Welcome to <span style="color: #4c7bf4">Easy Marko!</span>

Easy Marko is a markdown editor. In runs in the browser or on your device as a Progressive Web App. This page is an ordinary document. Edit it, break it, or close it from the sidebar when you're done. You can bring it back by clicking the About button in the toolbar.

The first half shows the Markdown features this viewer supports. The second half covers the parts of the app that are easy to miss. Jump to [the guide](#using-the-app) if you already know markdown.

## Markdown guide

### Text

You get **bold**, *italic*, ~~strikethrough~~, `inline code` and [links](https://commonmark.org). Bare URLs like https://example.com become links on their own.

Straight quotes turn "curly" in the preview, and `--` becomes an en dash, as in pages 10--12. Use `---` to type an em dash --- so you can sound just like your favourite LLM.

---

### Lists and tasks

1. Numbered lists
2. Bullet lists
   - which nest
   - like this

- [x] Write a task list
- [ ] Tick it off in the source by changing `[ ]` to `[x]`

### Tables

| Shortcut      | Effect        |
| ------------- | ------------- |
| `Mod-B`       | Bold          |
| `Mod-I`       | Italic        |
| `Mod-K`       | Link          |
| `Mod-Shift-X` | Strikethrough |

`Mod` is Cmd on a Mac and Ctrl everywhere else.

### Code

Fenced code gets the same highlighting as the editor.

```ts
function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
```

### Maths

An element of $\mathrm{PSL}(2, \mathbb{R})$ defined by

$$
  g =\begin{bmatrix} a & b \\ c & d \end{bmatrix} 
$$
acts by a *Möbius transformation* on $\hat{\mathbb{C}}$ of the form
$$
  x \mapsto \frac{ax + b}{cx + d}.
$$

### Footnotes

**Code**
```markdown
  You can create footnotes[^label]. Define it anyware in the document, and it is added to the bottom of the page.

  [^label]: Like this. There's also a handy link back to the source.
```

**Result**

You can create footnotes[^label]. Define it anyware in the document, and it is added to the bottom of the page.

[^label]: Like this. There's also a handy link back to the source.

### Alerts

> [!TIP]
> Start a blockquote with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` on its own line.

> [!WARNING]
> The marker only works in a top-level blockquote, and it needs text after it.

### HTML

Raw HTML works, and markdown inside it still renders if you leave blank lines around it.

<details>
<summary>Click to expand</summary>

This is **markdown** inside a `<details>` element.
</details>

Scripts, styles and forms get stripped, so pasting HTML from elsewhere can't break the app.

### Headings and anchors

Headings can be used as links. To format the link, use a single `#` and write the heading as hyphenated-lower-case. For example, `[Using the app](#using-the-app)` becomes [Using the app](#using-the-app). You can also link to the top with [`#top`](#top).

---

## Using the app

### Views

The toolbar switches between source, split and preview mode. You can drag the separators to resize and collapse the panes, or hover over the separators to show buttons.

**Alt-click** anywhere in the preview to jump to that line in the source, and alt-click in the source to jump the other way. Scroll sync keeps the panes lined up. Turn it off in the toolbar if it gets in your way.

### Backups

The app automatically backs everything up in local storage, including unsaved documents. Clearing site data deletes it, so save anything you care about as a file.

### Files

You can open a file with `Mod-O`, through the toolbar, or by dropping a file onto the window.

In Chrome and Edge, a saved document stays linked to its file. If another program changes an open file, a notice offers to reload it. Reloading can be undone with `Mod-Z`.

Other browsers can't write to files, so Save downloads a copy instead.

Double-click a name to rename it. Renaming unlinks the document from its file, so the next save asks where to put it.

### Images

Relative image paths like `![](images/photo.png)` work for documents opened from disk in Chrome or Edge. The browser can't read the folder until you allow it, so the image first shows an **Allow access** button. Grant the folder once and every other document inside it shows its images straight away.

### Editing

- `Mod-F` opens find and replace.
- Paste a URL over selected text to turn it into a link.

### Exporting

The export button saves the document as a self-contains HTML file. It follows the reader's light or dark setting, and it includes the maths fonts and any local images the app can read, so you can send it to someone as is.

### Installing

Easy Marko can be installed to your device as a Progressive Web App. Once installed, you can open `.md` files with it from your file manager.
