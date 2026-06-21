import hashlib
from app.csv_report import generate_csv
from app.emailer import delivery_email
from app.pdf_report import generate_pdf
from datetime import datetime, timezone


def test_csv_has_bom_selected_columns_and_rfc4180_escaping():
    content = generate_csv([{"name": "Zoë", "message": 'hello, "world"\nnext', "ignored": 1}], ["name", "message"])
    assert content.startswith(b"\xef\xbb\xbf")
    text = content[3:].decode()
    assert text.splitlines()[0] == "name,message"
    assert '"hello, ""world""' in text
    assert "ignored" not in text


def test_pdf_truncates_detail_table_at_10000_rows():
    rows = [{"message": i, "channel": "Email", "policy": "Conduct", "flagged": True} for i in range(10_001)]
    template = {"name": "Test", "tenant_id": "t", "columns": ["message"], "grouping_dimensions": ["channel"]}
    content, shown = generate_pdf(template, rows, {"start_date": "2026-01-01", "end_date": "2026-01-31"}, "https://csv", datetime.now(timezone.utc))
    assert content.startswith(b"%PDF-1.4")
    assert shown == 10_000
    assert b"Showing 10,000 of 10,001 rows" in content
    assert b"10000 |" not in content


def test_artifact_hash_is_of_plaintext_and_storage_is_encrypted(stack):
    content = b"sensitive report"
    size, digest = stack["store"].put("tenant/report.csv.aes", content)
    assert size == len(content) and digest == hashlib.sha256(content).hexdigest()
    assert stack["store"].get("tenant/report.csv.aes") == content
    assert b"sensitive report" not in (stack["store"].root / "tenant/report.csv.aes").read_bytes()


def test_large_attachment_falls_back_to_link():
    email, mode = delivery_email("a@b.test", "Weekly", b"12345", "x.pdf", "attachment", "https://secure", attachment_limit=4)
    assert mode == "link" and email.attachment is None
    assert "switched" in email.body and "expires in 7 days" in email.body

