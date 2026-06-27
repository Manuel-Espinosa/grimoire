import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import type {
    ChatMessage,
    Provider,
    StreamCallbacks,
    StreamHandle,
} from './providerInterface.js';

export class OllamaProvider implements Provider {
    readonly id = 'ollama';
    private session = new Soup.Session();
    private encoder = new TextEncoder();
    private decoder = new TextDecoder();

    constructor(private host: string) {
        this.session.timeout = 0; // generation can be slow; no idle timeout
    }

    setHost(host: string): void {
        this.host = host.replace(/\/+$/, '');
    }

    private url(path: string): string {
        return `${this.host.replace(/\/+$/, '')}${path}`;
    }

    stream(
        messages: ChatMessage[],
        model: string,
        cb: StreamCallbacks,
    ): StreamHandle {
        const cancellable = new Gio.Cancellable();
        const body = JSON.stringify({ model, messages, stream: true });
        const msg = Soup.Message.new('POST', this.url('/api/chat'));
        msg.set_request_body_from_bytes(
            'application/json',
            new GLib.Bytes(this.encoder.encode(body)),
        );

        let full = '';

        this.session.send_async(
            msg,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (_s, res) => {
                let inputStream: Gio.InputStream;
                try {
                    // send_finish returns an InputStream; coerce across the
                    // (duplicated) @girs gio type copies — same runtime object.
                    inputStream = this.session.send_finish(
                        res,
                    ) as unknown as Gio.InputStream;
                } catch (e) {
                    if (!cancellable.is_cancelled())
                        cb.onError(toError(e));
                    return;
                }
                const status = msg.get_status();
                if (status < 200 || status >= 300) {
                    cb.onError(new Error(`Ollama HTTP ${status}`));
                    return;
                }
                const data = new Gio.DataInputStream({
                    base_stream: inputStream,
                });

                const readNext = (): void => {
                    data.read_line_async(
                        GLib.PRIORITY_DEFAULT,
                        cancellable,
                        (_d, lineRes) => {
                            let line: string | null;
                            try {
                                [line] = data.read_line_finish_utf8(lineRes);
                            } catch (e) {
                                if (!cancellable.is_cancelled())
                                    cb.onError(toError(e));
                                return;
                            }
                            if (line === null) {
                                cb.onDone(full);
                                return;
                            }
                            const trimmed = line.trim();
                            if (trimmed.length > 0) {
                                try {
                                    const obj = JSON.parse(trimmed);
                                    const token: string =
                                        obj?.message?.content ?? '';
                                    if (token) {
                                        full += token;
                                        cb.onToken(token);
                                    }
                                    if (obj?.done === true) {
                                        cb.onDone(full, {
                                            inputTokens: obj.prompt_eval_count,
                                            outputTokens: obj.eval_count,
                                        });
                                        return;
                                    }
                                } catch (_e) {
                                    // skip a malformed line, keep reading
                                }
                            }
                            readNext();
                        },
                    );
                };
                readNext();
            },
        );

        return { cancel: () => cancellable.cancel() };
    }

    complete(messages: ChatMessage[], model: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.stream(messages, model, {
                onToken: () => {},
                onDone: (full) => resolve(full),
                onError: (err) => reject(err),
            });
        });
    }

    private requestText(method: string, path: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const msg = Soup.Message.new(method, this.url(path));
            this.session.send_and_read_async(
                msg,
                GLib.PRIORITY_DEFAULT,
                null,
                (_s, res) => {
                    try {
                        const bytes = this.session.send_and_read_finish(res);
                        const status = msg.get_status();
                        const raw = bytes?.get_data();
                        const text = raw ? this.decoder.decode(raw) : '';
                        if (status >= 200 && status < 300) resolve(text);
                        else reject(new Error(`Ollama HTTP ${status}`));
                    } catch (e) {
                        reject(toError(e));
                    }
                },
            );
        });
    }

    async listModels(): Promise<string[]> {
        const text = await this.requestText('GET', '/api/tags');
        const obj = JSON.parse(text);
        const models: Array<{ name?: string }> = obj?.models ?? [];
        return models
            .map((m) => m.name)
            .filter((n): n is string => typeof n === 'string')
            .sort();
    }

    async ping(): Promise<boolean> {
        try {
            await this.requestText('GET', '/api/tags');
            return true;
        } catch (_e) {
            return false;
        }
    }
}

function toError(e: unknown): Error {
    return e instanceof Error ? e : new Error(String(e));
}
