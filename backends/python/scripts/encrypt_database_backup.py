"""Encrypt a database backup for the offline X25519 recovery key.

The runner needs only the public recipient key. Keep the private identity key
offline; it is never needed to create or upload a backup.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import tarfile
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

MAGIC = b"HETU-BACKUP-X25519-AESGCM-v1\n"
KEY_INFO = b"hetu-database-backup-v1"
HEADER_LENGTH = len(MAGIC) + 32 + 12


def read_key(path: Path) -> bytes:
    data = base64.b64decode(path.read_text().strip(), validate=True)
    if len(data) != 32:
        raise ValueError("X25519 key must be 32 bytes")
    return data


def verify_plaintext(directory: Path) -> None:
    manifest = json.loads((directory / "manifest.json").read_text())
    digest = hashlib.sha256((directory / "database.dump").read_bytes()).hexdigest()
    if digest != manifest["dump_sha256"]:
        raise ValueError("Database dump does not match its manifest")


def derive_key(shared_secret: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=KEY_INFO).derive(
        shared_secret
    )


def keygen(public_path: Path, private_path: Path) -> None:
    private_path.parent.mkdir(parents=True, exist_ok=True)
    private_key = X25519PrivateKey.generate()
    public_bytes = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    private_bytes = private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    old_umask = os.umask(0o077)
    try:
        with private_path.open("x") as output:
            output.write(base64.b64encode(private_bytes).decode() + "\n")
        with public_path.open("x") as output:
            output.write(base64.b64encode(public_bytes).decode() + "\n")
    finally:
        os.umask(old_umask)


def encrypt(directory: Path, recipient_path: Path, output_path: Path) -> None:
    verify_plaintext(directory)
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as package:
        for name in ("manifest.json", "database.dump"):
            package.add(directory / name, arcname=name, recursive=False)
    recipient = X25519PublicKey.from_public_bytes(read_key(recipient_path))
    ephemeral = X25519PrivateKey.generate()
    ephemeral_public = ephemeral.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    nonce = os.urandom(12)
    header = MAGIC + ephemeral_public + nonce
    cipher = AESGCM(derive_key(ephemeral.exchange(recipient))).encrypt(
        nonce, archive.getvalue(), header
    )
    with output_path.open("xb") as output:
        output.write(header + cipher)
    print(f"Encrypted backup: {output_path}")


def decrypt(input_path: Path, identity_path: Path, directory: Path) -> None:
    payload = input_path.read_bytes()
    if len(payload) <= HEADER_LENGTH or not payload.startswith(MAGIC):
        raise ValueError("Unknown or incomplete backup format")
    ephemeral_public = X25519PublicKey.from_public_bytes(payload[len(MAGIC) : len(MAGIC) + 32])
    nonce = payload[len(MAGIC) + 32 : HEADER_LENGTH]
    private_key = X25519PrivateKey.from_private_bytes(read_key(identity_path))
    plaintext = AESGCM(derive_key(private_key.exchange(ephemeral_public))).decrypt(
        nonce, payload[HEADER_LENGTH:], payload[:HEADER_LENGTH]
    )
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    with tarfile.open(fileobj=io.BytesIO(plaintext), mode="r:") as package:
        if package.getnames() != ["manifest.json", "database.dump"]:
            raise ValueError("Backup archive has unexpected members")
        for member in package:
            if not member.isfile() or member.name not in {"manifest.json", "database.dump"}:
                raise ValueError("Backup archive contains an unsafe member")
            source = package.extractfile(member)
            if source is None:
                raise ValueError("Backup archive member is unreadable")
            with (directory / member.name).open("xb") as output:
                output.write(source.read())
    verify_plaintext(directory)
    print(f"Decrypted backup and verified manifest: {directory}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest="mode", required=True)
    create = modes.add_parser("keygen")
    create.add_argument("public_key", type=Path)
    create.add_argument("private_key", type=Path)
    seal = modes.add_parser("encrypt")
    seal.add_argument("backup_directory", type=Path)
    seal.add_argument("recipient_key", type=Path)
    seal.add_argument("output", type=Path)
    open_backup = modes.add_parser("decrypt")
    open_backup.add_argument("input", type=Path)
    open_backup.add_argument("identity_key", type=Path)
    open_backup.add_argument("output_directory", type=Path)
    args = parser.parse_args()
    if args.mode == "keygen":
        keygen(args.public_key, args.private_key)
    elif args.mode == "encrypt":
        encrypt(args.backup_directory, args.recipient_key, args.output)
    else:
        decrypt(args.input, args.identity_key, args.output_directory)


if __name__ == "__main__":
    main()
