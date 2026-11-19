# JeeT Launch Mainnet identities on your Chromebook

Use the Chromebook's **local Linux Terminal**. All four signing keys must remain under your control. The helper makes four separate Ed25519 keys. It saves passphrase-encrypted PKCS#8 files and prints only the public addresses. It creates no recovery phrases, sends no requests, and takes no blockchain action.

| Role | What the key controls |
| --- | --- |
| `program` | The new JeeT Launch program address. Keep this signer offline between deployment operations. |
| `containmentAuthority` | The program's release mode, including emergency closure. Keep it independent and accessible for incident response. |
| `deploymentPayer` | Payment of approved deployment fees and rent. Keep this separate from the upgrade authority and fund it only after an exact budget is approved. |
| `initialUpgradeAuthority` | The first Solana loader upgrade authority. Store it offline with a separate backup and passphrase. |
| Existing treasury | Keep `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP` as the approved beneficiary. Its existing signer stays in its current custody. |

## 1. Set up Linux and take the Chromebook offline

In ChromeOS, go to **Settings → About ChromeOS → Developers → Linux development environment → Set up**. Open **Terminal → penguin**. Use your personal Chromebook. Use another owner-controlled device if your Chromebook is managed or Linux is unavailable. [Google's Chromebook Linux setup](https://support.google.com/chromebook/answer/9145439?hl=en-en)

While connected, run `python3 --version` and `openssl version`. If needed, install the Debian packages with `sudo apt update && sudo apt install python3 openssl`. Download [chromebook-mainnet-keys.py](../scripts/readiness/chromebook-mainnet-keys.py) from this repository and place it in **Linux files**. Turn off Wi-Fi and unplug any wired connection or tether before generating keys. Close any remote sessions or screen shares. Use only the local Terminal for the commands below. [Google's guide to Linux files](https://developers.google.com/chromeos/app-development/develop/setup)

## 2. Generate four roles

Run these one at a time. At each OpenSSL prompt, type and confirm a distinct strong passphrase. Record each passphrase separately in a secure offline place. Passphrases stay out of commands, chat, screenshots, and backups. [OpenSSL encrypted PKCS#8 options](https://docs.openssl.org/3.0/man1/openssl-pkcs8/)

```bash
cd ~
python3 chromebook-mainnet-keys.py generate program
python3 chromebook-mainnet-keys.py generate containmentAuthority
python3 chromebook-mainnet-keys.py generate deploymentPayer
python3 chromebook-mainnet-keys.py generate initialUpgradeAuthority
```

Record the four public addresses with their labels. Each one should differ. The tool writes encrypted files under `~/.jeet-mainnet-keys/` and refuses to overwrite one. Keep this directory out of Git, Codespaces, Google Drive, and Linux container backups.

## 3. Back up and verify

Use two removable drives you control. In **Files**, right-click the removable drive or its intended folder, choose **Share with Linux**, then find it under `/mnt/chromeos` in Terminal. Replace the example path below with the actual mounted path. Run this for each drive. `mkdir` requires a new folder, so use a new folder name if one already exists. The four files copied by this command are already encrypted. [Google's guide to shared folders](https://developers.google.com/chromeos/app-development/develop/setup)

```bash
drive='/mnt/chromeos/removable/YOUR_DRIVE_NAME'
backup="$drive/JeeT-Mainnet-Backup"
mkdir -- "$backup" && cp -- ~/.jeet-mainnet-keys/{program,containmentAuthority,deploymentPayer,initialUpgradeAuthority}.pem "$backup/"
```

For each drive, verify all four files against the **public address printed at generation**. In the commands below, replace each placeholder with its corresponding address. The tool decrypts only to derive the public address and reports a mismatch as an error.

```bash
python3 ~/chromebook-mainnet-keys.py verify program "$backup" PROGRAM_PUBLIC_ADDRESS
python3 ~/chromebook-mainnet-keys.py verify containmentAuthority "$backup" CONTAINMENT_PUBLIC_ADDRESS
python3 ~/chromebook-mainnet-keys.py verify deploymentPayer "$backup" PAYER_PUBLIC_ADDRESS
python3 ~/chromebook-mainnet-keys.py verify initialUpgradeAuthority "$backup" UPGRADE_PUBLIC_ADDRESS
```

Eject both drives and store them separately from each other and from their passphrases. Keep the original files encrypted on the owner device. Treat the Chromebook as a software signer. An upgrade-authority change or move to multisig is a separate approval.

## 4. Share public addresses and stop

Send the four public addresses with their role names. The final candidate can be built from the program and containment addresses. The payer and upgrade authority are inputs to deployment preflight. The existing treasury remains fixed. A later key-control challenge uses only detached off-chain signatures and can follow once the source commit and addresses are fixed. Keep the encrypted files and passphrases offline. See the [release gate and operator runbook](MAINNET-RELEASE-GATE.md).
