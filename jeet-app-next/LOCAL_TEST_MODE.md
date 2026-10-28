# JeeT Launch — Local Test Mode

This build adds a server-side local-validator test path so token creation can be tested without Phantom, public Devnet SOL, faucet limits, or forwarded validator ports.

## Run

Terminal 1:

```bash
npm run validator
```

Terminal 2:

```bash
npm run dev
```

Only port 3000 needs to be opened in Codespaces.

## What the test does

The `/api/local-test/create` server route:

1. Connects to `http://127.0.0.1:8899` and `ws://127.0.0.1:8900` inside Codespaces.
2. Generates a temporary payer for that request.
3. Automatically airdrops 2 local SOL to the payer.
4. Creates a real SPL mint on the local validator.
5. Creates the payer's associated token account and mints the configured test supply.
6. Applies the selected mint/freeze authority revocations.
7. Fetches the mint account back from the validator as verification.

No private key is stored and no real or Devnet SOL is used.
