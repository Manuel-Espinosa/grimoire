import St from 'gi://St';
import GLib from 'gi://GLib';
import type { Settings } from '../settings.js';
import { readJson, writeJson, saveSnippet } from '../storage.js';

const FILE = 'history.json';
const POLL_MS = 1000;

export interface ClipItem {
    id: string;
    text: string;
    ts: number;
    pinned?: boolean;
    tag?: string;
}

export class ClipboardHistory {
    private items: ClipItem[];
    private timerId = 0;
    private lastSeen: string | null;
    private listeners = new Set<() => void>();

    constructor(private settings: Settings) {
        // Backfill ids for histories written before items had one.
        this.items = readJson<ClipItem[]>(FILE, []).map((i) => ({
            ...i,
            id: i.id ?? GLib.uuid_string_random(),
        }));
        this.lastSeen = this.items[0]?.text ?? null;
    }

    start(): void {
        if (this.timerId) return;
        this.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
            this.poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop(): void {
        if (this.timerId) {
            GLib.source_remove(this.timerId);
            this.timerId = 0;
        }
    }

    private poll(): void {
        St.Clipboard.get_default().get_text(
            St.ClipboardType.CLIPBOARD,
            (_cb, text) => {
                if (!text || text === this.lastSeen) return;
                this.lastSeen = text;
                this.promote(text);
            },
        );
    }

    /** Add/move an entry to the top, dedup by text (preserving its id, pin and
     *  tag if it already existed), enforce the cap, persist, notify. */
    private promote(text: string): ClipItem {
        const existing = this.items.find((i) => i.text === text);
        let item: ClipItem;
        if (existing) {
            existing.ts = Date.now();
            this.items = this.items.filter((i) => i !== existing);
            item = existing;
        } else {
            item = { id: GLib.uuid_string_random(), text, ts: Date.now() };
        }
        this.items.unshift(item);
        this.enforceCap();
        this.persist();
        return item;
    }

    /** The cap bounds only unpinned Items; pinned Items are kept regardless. */
    private enforceCap(): void {
        const max = Math.max(1, this.settings.maxHistoryItems);
        const unpinned = this.items.filter((i) => !i.pinned);
        if (unpinned.length > max) {
            const evict = new Set(unpinned.slice(max));
            this.items = this.items.filter((i) => !evict.has(i));
        }
    }

    private setSystemClipboard(text: string): void {
        this.lastSeen = text; // our own write must not re-register as new
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
    }

    /** User picked an existing item: put it on the system clipboard + top. */
    copyBack(id: string): void {
        const item = this.byId(id);
        if (!item) return;
        this.promote(item.text);
        this.setSystemClipboard(item.text);
    }

    /** A Spell finished: its output becomes a new top item AND the clipboard,
     *  while the original input remains in history (option C / never-mutate). */
    addResult(text: string): void {
        this.promote(text);
        this.setSystemClipboard(text);
    }

    /** Replace an Item's text in place, keeping its id, pin and tag. */
    editText(id: string, text: string): void {
        const item = this.byId(id);
        if (!item || !text) return;
        item.text = text;
        this.persist();
    }

    /** Set (or clear, with an empty string) an Item's free-text tag. */
    setTag(id: string, tag: string): void {
        const item = this.byId(id);
        if (!item) return;
        item.tag = tag.trim() || undefined;
        this.persist();
    }

    togglePin(id: string): void {
        const item = this.byId(id);
        if (!item) return;
        item.pinned = !item.pinned;
        this.persist();
    }

    /** Write an Item out to a snippet file; returns the path written. */
    exportItem(id: string): string | null {
        const item = this.byId(id);
        return item ? saveSnippet(item.text) : null;
    }

    remove(id: string): void {
        this.items = this.items.filter((i) => i.id !== id);
        this.persist();
    }

    /** Clear unpinned Items; pinned ones are kept (they are deliberate keeps). */
    clear(): void {
        this.items = this.items.filter((i) => i.pinned);
        this.persist();
    }

    /** Display order: pinned first, then by recency within each group. */
    get all(): readonly ClipItem[] {
        const byRecency = (a: ClipItem, b: ClipItem): number => b.ts - a.ts;
        const pinned = this.items.filter((i) => i.pinned).sort(byRecency);
        const rest = this.items.filter((i) => !i.pinned).sort(byRecency);
        return [...pinned, ...rest];
    }

    private byId(id: string): ClipItem | undefined {
        return this.items.find((i) => i.id === id);
    }

    private persist(): void {
        writeJson(FILE, this.items);
        this.emit();
    }

    onChanged(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    private emit(): void {
        for (const l of this.listeners) l();
    }
}
