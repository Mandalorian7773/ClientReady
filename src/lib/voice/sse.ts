/**
 * Incremental Server-Sent Events parser. Feed it decoded text as it arrives;
 * it returns complete events. Used for Gnani Timbre's SSE stream
 * (`start`, `chunk` with base64 audio, `complete`, `error`).
 */
export interface SseEvent {
  event: string;
  data: unknown;
}

export class SseParser {
  private buf = "";

  push(text: string): SseEvent[] {
    this.buf += text.replace(/\r/g, "");
    const out: SseEvent[] = [];
    let i: number;
    while ((i = this.buf.indexOf("\n\n")) >= 0) {
      const block = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        out.push({ event, data: JSON.parse(data) });
      } catch {
        /* skip malformed event */
      }
    }
    return out;
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
