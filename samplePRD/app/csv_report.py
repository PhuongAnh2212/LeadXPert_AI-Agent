from __future__ import annotations
import csv
import io
from typing import Any, Iterable


def generate_csv(rows: Iterable[dict[str, Any]], columns: list[str]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore", lineterminator="\r\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: row.get(column, "") for column in columns})
    return b"\xef\xbb\xbf" + stream.getvalue().encode("utf-8")

