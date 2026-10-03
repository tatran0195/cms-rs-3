/**
 * Main-thread client interface communicating with AstWorker.
 * Transparently falls back to inline synchronous parsing if Web Workers
 * are unavailable (e.g. server-side rendering or restricted worker environments).
 */
import {
  extractHeadingsSync,
  parseFrontmatterSync,
  type AstWorkerParseRequest,
  type AstWorkerParseResponse,
} from "./ast-worker";

class AstWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<
    string,
    { resolve: (val: any) => void; reject: (err: Error) => void }
  >();
  private messageCounter = 0;

  constructor() {
    if (typeof window !== "undefined" && typeof Worker !== "undefined") {
      try {
        // Vite syntax for instant Worker instantiation
        this.worker = new Worker(
          new URL("./ast-worker.ts", import.meta.url),
          { type: "module" },
        );
        this.worker.onmessage = (e: MessageEvent<AstWorkerParseResponse>) => {
          const { id, result, error } = e.data;
          const deferred = this.pending.get(id);
          if (!deferred) return;
          this.pending.delete(id);
          if (error) {
            deferred.reject(new Error(error));
          } else {
            deferred.resolve(result);
          }
        };
      } catch {
        this.worker = null;
      }
    }
  }

  private dispatch<T>(type: AstWorkerParseRequest["type"], payload: string): Promise<T> {
    if (!this.worker) {
      // Direct thread fallback
      if (type === "parse-frontmatter") {
        return Promise.resolve(parseFrontmatterSync(payload) as unknown as T);
      }
      if (type === "extract-headings") {
        return Promise.resolve(extractHeadingsSync(payload) as unknown as T);
      }
      return Promise.reject(new Error(`Unsupported fallback job: ${type}`));
    }

    const id = `ast-${++this.messageCounter}-${Date.now()}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker?.postMessage({ id, type, payload });
    });
  }

  public parseFrontmatter(markdown: string) {
    return this.dispatch<{ frontmatter: Record<string, string>; content: string }>(
      "parse-frontmatter",
      markdown,
    );
  }

  public extractHeadings(markdown: string) {
    return this.dispatch<Array<{ level: number; text: string; id: string }>>(
      "extract-headings",
      markdown,
    );
  }
}

export const astWorkerClient = new AstWorkerClient();
