#!/usr/bin/env python3
"""Minimal SMTP sink for E2E.

The CMS authenticates with a real 6-digit email OTP that it only issues after
configured SMTP delivery succeeds. There is no real mailbox in CI, so we run a
throwaway SMTP server that speaks the real protocol (HELO/MAIL/RCPT/DATA) and
writes every accepted message to disk as JSON.

This is NOT an application mock: the backend's real lettre SMTP transport, real
templates and real token persistence all run unchanged. Only the final hop
(instead of Gmail) is replaced, which is the standard `smtp_plain_no_tls`
"Mailpit" mode the product documents for local development.

Usage:  python3 smtp_sink.py <port> <output_dir>
"""

import asyncio
import email
import json
import os
import sys
from datetime import datetime, timezone

HOST = "127.0.0.1"


class SmtpSession:
    def __init__(self, reader, writer, out_dir):
        self.reader = reader
        self.writer = writer
        self.out_dir = out_dir
        self.mail_from = ""
        self.rcpt_to = []

    async def send(self, line: str):
        self.writer.write((line + "\r\n").encode())
        await self.writer.drain()

    async def run(self):
        await self.send("220 cms-e2e-smtp ready")
        while True:
            try:
                raw = await self.reader.readline()
            except (ConnectionResetError, BrokenPipeError):
                return
            if not raw:
                return
            line = raw.decode("utf-8", "replace").strip()
            upper = line.upper()

            if upper.startswith("EHLO"):
                await self.send("250-cms-e2e-smtp")
                await self.send("250-AUTH PLAIN LOGIN")
                await self.send("250 SIZE 10485760")
            elif upper.startswith("HELO"):
                await self.send("250 cms-e2e-smtp")
            elif upper.startswith("AUTH"):
                # Accept any credentials; the sink has no mailbox to protect.
                if upper.endswith("PLAIN"):
                    await self.reader.readline()  # base64 user\0pass
                elif upper.endswith("LOGIN") and not upper.startswith("AUTH LOGIN PLAIN"):
                    await self.send("334 VXNlcm5hbWU6")  # Username:
                    await self.reader.readline()
                    await self.send("334 UGFzc3dvcmQ6")  # Password:
                    await self.reader.readline()
                await self.send("235 2.7.0 Authentication successful")
            elif upper.startswith("MAIL FROM"):
                self.mail_from = line.split(":", 1)[1].strip()
                await self.send("250 2.1.0 Ok")
            elif upper.startswith("RCPT TO"):
                self.rcpt_to.append(line.split(":", 1)[1].strip())
                await self.send("250 2.1.5 Ok")
            elif upper == "DATA":
                await self.send("354 End data with <CR><LF>.<CR><LF>")
                chunks = []
                while True:
                    data = await self.reader.readline()
                    if not data:
                        return
                    text = data.decode("utf-8", "replace")
                    if text.strip() == ".":
                        break
                    if text.startswith(".."):
                        text = text[1:]
                    chunks.append(text)
                self.persist("".join(chunks))
                await self.send("250 2.0.0 Ok: queued")
            elif upper == "QUIT":
                await self.send("221 2.0.0 Bye")
                return
            elif upper == "RSET":
                self.mail_from, self.rcpt_to = "", []
                await self.send("250 2.0.0 Ok")
            elif upper == "NOOP":
                await self.send("250 2.0.0 Ok")
            else:
                await self.send("250 2.0.0 Ok")

    def persist(self, raw_message: str):
        msg = email.message_from_string(raw_message)
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    payload = part.get_payload(decode=True) or b""
                    body = payload.decode("utf-8", "replace")
                    break
        else:
            payload = msg.get_payload(decode=True) or b""
            body = payload.decode("utf-8", "replace")

        recipients = [
            address.strip("<>") for address in self.rcpt_to
        ]
        record = {
            "receivedAt": datetime.now(timezone.utc).isoformat(),
            "from": self.mail_from.split(">", 1)[0].strip().strip("<>"),
            "to": recipients,
            "subject": msg.get("Subject", ""),
            "body": body,
        }
        seq = len(os.listdir(self.out_dir)) + 1
        target = os.path.join(self.out_dir, f"{seq:06d}.json")
        with open(target, "w", encoding="utf-8") as handle:
            json.dump(record, handle, ensure_ascii=False, indent=2)
        sys.stderr.write(f"[smtp-sink] stored {target} -> {recipients}\n")
        sys.stderr.flush()


async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 1025
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "/tmp/cms-e2e-mail"
    os.makedirs(out_dir, exist_ok=True)
    server = await asyncio.start_server(
        lambda r, w: SmtpSession(r, w, out_dir).run(), HOST, port
    )
    sys.stderr.write(f"[smtp-sink] listening on {HOST}:{port} -> {out_dir}\n")
    sys.stderr.flush()
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass