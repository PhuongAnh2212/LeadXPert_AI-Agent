from __future__ import annotations
import hashlib
import os
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class EncryptedArtifactStore:
    """AES-256-GCM local adapter; replace with a WORM object-store adapter in production."""
    def __init__(self, root: Path, key: bytes):
        if len(key) != 32: raise ValueError("AES-256 requires a 32-byte key")
        self.root = root; self.root.mkdir(parents=True, exist_ok=True); self.cipher = AESGCM(key)

    def put(self, storage_key: str, content: bytes) -> tuple[int, str]:
        target = self.root / storage_key
        if target.exists(): raise FileExistsError("immutable artifact already exists")
        target.parent.mkdir(parents=True, exist_ok=True)
        nonce = os.urandom(12)
        encrypted = nonce + self.cipher.encrypt(nonce, content, storage_key.encode())
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        fd = os.open(target, flags, 0o400)
        with os.fdopen(fd, "wb") as handle: handle.write(encrypted)
        return len(content), hashlib.sha256(content).hexdigest()

    def get(self, storage_key: str) -> bytes:
        payload = (self.root / storage_key).read_bytes()
        return self.cipher.decrypt(payload[:12], payload[12:], storage_key.encode())

