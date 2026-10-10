import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

interface MailMessage {
  receivedAt: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
}

/**
 * Reads the mail the local SMTP sink captured.
 *
 * The product's authentication is a real 6-digit email OTP that is only issued
 * once SMTP delivery succeeds, so a test inbox is required to complete a login
 * through the UI. This helper plays the role of the user's mailbox: the backend
 * composes and "sends" the real message, and we read the delivered code back —
 * exactly what a person would do. Nothing about the auth flow is stubbed.
 */
export class Mailbox {
  constructor(private readonly dir: string) {}

  static fromEnv(): Mailbox {
    return new Mailbox(process.env.E2E_MAIL_DIR ?? 'target/e2e-mail');
  }

  /** Wait for the newest message addressed to `email`, optionally after `since`. */
  async waitForMessage(email: string, options: { since?: number; timeoutMs?: number } = {}): Promise<MailMessage> {
    const since = options.since ?? 0;
    const timeoutMs = options.timeoutMs ?? 20_000;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const found = this.list().find(
        (message) => message.to.some((recipient) => recipient.toLowerCase() === email.toLowerCase()) && Date.parse(message.receivedAt) >= since,
      );
      if (found) {
        return found;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out after ${timeoutMs}ms waiting for an email to ${email} in ${this.dir}. ` +
            `Seen recipients: ${JSON.stringify(this.list().map((m) => m.to))}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  /** Extract the 6-digit OTP from the newest message to `email`. */
  async waitForOtp(email: string, options: { since?: number; timeoutMs?: number } = {}): Promise<string> {
    const message = await this.waitForMessage(email, options);
    // Prefer the explicit machine-readable line, then any standalone 6 digits.
    const labelled = message.body.match(/\b(\d{6})\b/);
    const code = labelled?.[1];
    if (!code) {
      throw new Error(`No 6-digit code found in message body:\n${message.body.slice(0, 500)}`);
    }
    return code;
  }

  /** Newest timestamp seen across the inbox — use as `since` for the next wait. */
  latestTimestamp(): number {
    return this.list().reduce((max, message) => Math.max(max, Date.parse(message.receivedAt)), 0);
  }

  private list(): MailMessage[] {
    let names: string[];
    try {
      names = readdirSync(this.dir);
    } catch {
      return [];
    }
    const messages: MailMessage[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) {
        continue;
      }
      const path = join(this.dir, name);
      try {
        if (!statSync(path).isFile()) {
          continue;
        }
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as MailMessage;
        if (parsed && Array.isArray(parsed.to)) {
          messages.push(parsed);
        }
      } catch {
        // Partially written file while the sink is flushing; skip this tick.
      }
    }
    return messages.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
  }
}
