#!/usr/bin/env python3
"""Owner-device-only Ed25519 generation and encrypted backup verification."""

import argparse
import os
from pathlib import Path
import resource
import stat
import subprocess

ROLES = ("program", "containmentAuthority", "deploymentPayer", "initialUpgradeAuthority")
VAULT = Path.home() / ".jeet-mainnet-keys"
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
ED25519_PUBLIC_HEADER = bytes.fromhex("302a300506032b6570032100")
ENCRYPTED_HEADER = b"-----BEGIN ENCRYPTED PRIVATE KEY-----\n"


def openssl(*args, data=None):
    # Capture all cryptographic output. OpenSSL prompts on the controlling terminal.
    return subprocess.run(
        ["openssl", *args], input=data, stdout=subprocess.PIPE, check=True,
    ).stdout


def public_address(public_der):
    if len(public_der) != len(ED25519_PUBLIC_HEADER) + 32 or not public_der.startswith(ED25519_PUBLIC_HEADER):
        raise ValueError("Expected an Ed25519 public key.")
    raw = public_der[len(ED25519_PUBLIC_HEADER):]
    zeroes = len(raw) - len(raw.lstrip(b"\0"))
    number = int.from_bytes(raw, "big")
    digits = []
    while number:
        number, index = divmod(number, 58)
        digits.append(ALPHABET[index])
    return "1" * zeroes + "".join(reversed(digits))


def generate(role):
    VAULT.mkdir(mode=0o700, exist_ok=True)
    state = VAULT.lstat()
    if not stat.S_ISDIR(state.st_mode) or state.st_uid != os.getuid() or state.st_mode & 0o077:
        raise ValueError("The Chromebook key directory must be owner-only and must not be a symlink.")
    destination = VAULT / (role + ".pem")
    if destination.exists() or destination.is_symlink():
        raise ValueError("That role already has a local file. Verify the existing backup.")
    key = openssl("genpkey", "-algorithm", "ED25519")
    address = public_address(openssl("pkey", "-pubout", "-outform", "DER", data=key))
    encrypted = openssl(
        "pkcs8", "-topk8", "-v2", "aes-256-cbc", "-v2prf", "hmacWithSHA256",
        "-iter", "600000", data=key,
    )
    if not encrypted.startswith(ENCRYPTED_HEADER):
        raise ValueError("Encryption failed. No key file was saved.")
    with destination.open("xb") as output:
        output.write(encrypted)
        output.flush()
        os.fsync(output.fileno())
    return address


def verify(role, directory, expected):
    path = directory / (role + ".pem")
    with path.open("rb") as backup:
        if backup.readline(100) != ENCRYPTED_HEADER:
            raise ValueError("Expected an encrypted key file.")
    address = public_address(openssl("pkey", "-in", str(path), "-pubout", "-outform", "DER"))
    if address != expected:
        raise ValueError("Backup derives a different address. Keep both copies and investigate.")
    return address


def main():
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    commands.add_parser("generate").add_argument("role", choices=ROLES)
    check = commands.add_parser("verify")
    check.add_argument("role", choices=ROLES)
    check.add_argument("backup_directory", type=Path)
    check.add_argument("expected_address")
    args = parser.parse_args()
    try:
        with open("/dev/tty", "r", encoding="utf-8"):
            pass
        if args.action == "generate":
            address = generate(args.role)
            print(f"{args.role} encrypted file saved under {VAULT}")
        else:
            address = verify(args.role, args.backup_directory, args.expected_address)
            print(f"{args.role} encrypted backup verified")
        print(f"{args.role} public address: {address}")
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Operation stopped: {error}\n")


if __name__ == "__main__":
    main()
