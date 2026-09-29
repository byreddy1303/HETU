"""Upload an encrypted backup to private Vercel Blob and verify its bytes."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path

from vercel.blob import BlobClient


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("encrypted_file", type=Path)
    parser.add_argument("blob_path")
    args = parser.parse_args()
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise SystemExit("BLOB_READ_WRITE_TOKEN is required")
    payload = args.encrypted_file.read_bytes()
    expected = hashlib.sha256(payload).digest()
    client = BlobClient(token=token)
    uploaded = client.put(
        args.blob_path,
        payload,
        access="private",
        content_type="application/octet-stream",
        add_random_suffix=False,
        overwrite=False,
        multipart=True,
    )
    downloaded = client.get(uploaded.url, access="private", use_cache=False)
    if downloaded is None or hashlib.sha256(downloaded.content).digest() != expected:
        raise RuntimeError("Private Blob readback differs from the encrypted backup")
    print(f"Encrypted backup uploaded and verified: {uploaded.url}")


if __name__ == "__main__":
    main()
