export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface UsageInfo {
    inputTokens?: number;
    outputTokens?: number;
}

export interface StreamHandle {
    cancel(): void;
}

export interface StreamCallbacks {
    onToken(token: string): void;
    onDone(full: string, usage?: UsageInfo): void;
    onError(error: Error): void;
}

export interface Provider {
    readonly id: string;

    /** Streaming-first primitive. Tokens arrive via callbacks. */
    stream(
        messages: ChatMessage[],
        model: string,
        callbacks: StreamCallbacks,
    ): StreamHandle;

    /** Non-streaming convenience built on stream(); used by Spells. */
    complete(messages: ChatMessage[], model: string): Promise<string>;

    /** Models available on the configured host. */
    listModels(): Promise<string[]>;

    /** Connectivity probe — true if the host answers. */
    ping(): Promise<boolean>;
}
