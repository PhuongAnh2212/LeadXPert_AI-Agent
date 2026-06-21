from __future__ import annotations
from dataclasses import dataclass


@dataclass
class Email:
    to: str; subject: str; body: str; attachment_name: str | None = None; attachment: bytes | None = None


class EmailService:
    """Development outbox adapter; production can replace `send` with the platform provider."""
    def __init__(self): self.outbox: list[Email] = []
    def send(self, message: Email) -> None: self.outbox.append(message)


def delivery_email(recipient: str, report_name: str, content: bytes, filename: str, requested_mode: str, url: str, attachment_limit: int = 25 * 1024 * 1024) -> tuple[Email, str]:
    mode = "link" if requested_mode == "link" or len(content) > attachment_limit else "attachment"
    if mode == "link":
        note = "The report exceeded the attachment limit and was switched to a secure link. " if requested_mode == "attachment" else ""
        return Email(recipient, f"Compliance report: {report_name}", f"{note}Download (expires in 7 days; authentication required): {url}"), mode
    return Email(recipient, f"Compliance report: {report_name}", "Your compliance report is attached.", filename, content), mode
