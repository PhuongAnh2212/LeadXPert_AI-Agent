from __future__ import annotations
import hashlib
import hmac
import time


def make_download_token(artifact_id: str, key: bytes, expires_in: int = 7 * 24 * 3600) -> str:
    expiry = int(time.time()) + expires_in
    payload = f"{artifact_id}.{expiry}"
    signature = hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def verify_download_token(token: str, artifact_id: str, key: bytes) -> bool:
    try:
        token_id, expiry, signature = token.rsplit(".", 2)
        payload = f"{token_id}.{expiry}"
        return token_id == artifact_id and int(expiry) >= int(time.time()) and hmac.compare_digest(signature, hmac.new(key, payload.encode(), hashlib.sha256).hexdigest())
    except (ValueError, TypeError):
        return False

