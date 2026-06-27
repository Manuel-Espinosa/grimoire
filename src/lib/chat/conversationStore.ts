import GLib from 'gi://GLib';
import { readJson, writeJson } from '../storage.js';

const FILE = 'conversations.json';

export interface ChatMsg {
    role: 'user' | 'assistant';
    content: string;
    ts: number;
}

export interface Conversation {
    id: string;
    title: string;
    messages: ChatMsg[];
    createdAt: number;
    updatedAt: number;
}

export class ConversationStore {
    private convos: Conversation[];
    private listeners = new Set<() => void>();

    constructor() {
        this.convos = readJson<Conversation[]>(FILE, []);
    }

    /** Most-recently-updated first. */
    list(): Conversation[] {
        return [...this.convos].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    get(id: string): Conversation | undefined {
        return this.convos.find((c) => c.id === id);
    }

    create(): Conversation {
        const now = Date.now();
        const c: Conversation = {
            id: GLib.uuid_string_random(),
            title: 'New conversation',
            messages: [],
            createdAt: now,
            updatedAt: now,
        };
        this.convos.unshift(c);
        this.persist();
        return c;
    }

    addMessage(id: string, role: ChatMsg['role'], content: string): void {
        const c = this.get(id);
        if (!c) return;
        c.messages.push({ role, content, ts: Date.now() });
        c.updatedAt = Date.now();
        if (c.title === 'New conversation' && role === 'user')
            c.title = title(content);
        this.persist();
    }

    delete(id: string): void {
        this.convos = this.convos.filter((c) => c.id !== id);
        this.persist();
    }

    onChanged(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    private persist(): void {
        writeJson(FILE, this.convos);
        for (const l of this.listeners) l();
    }
}

function title(text: string): string {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    return oneLine.length > 40 ? oneLine.slice(0, 40) + '…' : oneLine || 'New conversation';
}
