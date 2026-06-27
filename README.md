# 🔮 Grimoire

**Grimoire** is a GNOME Shell extension that brings a clipboard history manager and a set of text-transformation spells to your top bar — powered locally by [Ollama](https://ollama.com). AI is entirely optional: the clipboard manager and the offline spells work with no model configured.

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-manuespinosa-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/manuespinosa)

---

## ✨ Features

### 📋 Clipboard history

- Top-bar button opens a popup with your recent clipboard items
- Lightweight ~1 s polling, text only
- Consecutive duplicates are collapsed automatically
- Configurable cap (default 20 items), persisted to disk — survives screen lock, Shell restart, and logout
- Per-item actions: copy, edit, pin, tag, export, delete
- Inline search field to filter items without leaving the keyboard

### 🪄 Spells

A spell transforms a clipboard item into a new one. The original is never mutated — the result is added as a fresh history entry and copied to the clipboard.

| Spell | Requires AI |
|---|---|
| ✏️ **Format JSON** — pretty-prints JSON | No |
| 🔄 **JSON ⇄ YAML** — converts between formats, auto-detecting direction | No |
| 📝 **Spellcheck** — fixes spelling, grammar and punctuation | ✨ Yes |
| 📖 **Summarize** — condenses text into its key points | ✨ Yes |
| 🌐 **Quick Translation** — translates between your two configured languages, auto-detecting which is which | ✨ Yes |
| 🎭 **Change tone** — rewrites text as *more formal* or *more casual* | ✨ Yes |
| 🔍 **Generate regex** — turns a natural-language description into a regex pattern | ✨ Yes |

### 🧙 Chat (Aldric)

A persistent floating chat window with streaming replies and multi-conversation support (list, create, switch, delete). Conversations are persisted to disk.

---

## 📦 Requirements

- GNOME Shell 50+
- Node.js (build only)
- [Ollama](https://ollama.com) running locally or on a LAN box (optional — only needed for AI spells and chat)

---

## 🛠️ Build & install

```bash
npm install
npm run build              # -> dist/
npm run install-extension  # builds + installs to ~/.local/share/gnome-shell/extensions/
```

After installing, reload GNOME Shell (Xorg: `Alt+F2` → `r`; Wayland: log out and back in), then:

```bash
gnome-extensions enable grimoire@iammanu.dev
```

Open **Settings** from the popup to set your Ollama host (e.g. `http://localhost:11434`), test the connection, and pick a model.

---

## 🐛 Debugging

```bash
journalctl --user -f -o cat _COMM=gnome-shell   # extension logs
journalctl --user -f -o cat _COMM=gjs           # prefs logs
```
