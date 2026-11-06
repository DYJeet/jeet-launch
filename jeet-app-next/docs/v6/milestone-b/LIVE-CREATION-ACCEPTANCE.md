# V6 Milestone B · locally verified

Tested source: `57d30b2b9dd43c92e1875156571a6619e166d61c`. The browser suite reported `completed: true` with live Pinata storage, four positive and eleven rejection groups. The disposable Wallet Standard harness signed genuine Ed25519 transactions against Agave 2.3.13 in the existing Codespace. Chromium 156.0.8078.73 ran at 390px and 1440px. Installed wallet extensions and native mobile wallets remain unverified.

Local genesis: `7ooAUEiEC3xd1D6HFw11wLwYRh45RLdmHseZzJqRaiZq`.
JeeT local program: `8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo`.
JeeT SBF SHA-256: `de162b056a588d075d186833f6e8ad2e355d7c8638ec9fbce8d2976414e11ebe`.
Metaplex SBF SHA-256: `bb0842f6d5740eabe8f9fb3b723b9ecd89cadf9f48ef9ad6a9dc6cfa8a9658e4`.

| Viewport | Mint | URI read from Metaplex |
| --- | --- | --- |
| 390px | `4m57ibu3nM2cBSovbc9aRz6FtwhJtRPAGmeigu9CwTE9` | `ipfs://bafkreibss6goay5mqf2g6jrjsuiuwjrhbuozsaaqljyk3ncysuvqiye5yq` |
| 1440px | `FtK9VeFajhvQDCwjLwfFKDJbEW9v7tXzdWSneywUWhXM` | `ipfs://bafkreifgwk3mdv7lyl7xj3x5ahc2dojzv7arh3xfmqktqpni6fzf3tiqem` |

Both JSON files reference the real image CID `bafybeieafk7f66b244czbfajlfteaxlojxsnxpxyotl2wggctw45kous24`. The authenticated Pinata records and retrieved bytes passed verification. Original image size was 1,378,636 bytes and Pinata reported a UnixFS DAG size of 1,378,944 bytes. The verified image SHA-256 is `f747bfa0ed9014400ddd92ec60bba50f1c809853460d58b9f6481d99fa9736ef`. The browser decoded the 1122 × 1402 image after wallet reconnection and reload in both viewports. Injected HTTP 503 responses affected only the negative tests. Real retrieval resumed without any change to the inspected on-chain accounts. Gateway availability and continued pinning remain external dependencies.

Each 0-decimal mint reconciled exactly: **1,000 = 10 creator + 594 curve custody + 396 migration custody**. Program ownership, token account owners, zero initial fees and reserve, immutable Metaplex data, and exact metadata identity passed. The final transaction revoked both mint and freeze authorities and registered prospective graduation terms atomically. The run created no trades. Each wallet reconciled **1,000,000,000 = 964,844,400 remaining + 35,125,600 account funding + 30,000 network fees**, in test lamports.

## Confirmed signatures

| Viewport | Stage | Bytes | Local-validator signature |
| --- | --- | ---: | --- |
| 390px | Mint | 464 | `5N6HmKHU4QxqaN8nKGJCmV6wjegHoUuzSLHGoFo8EgmQnSLLW3mjtqg1E2GvsqsEuPy4d3iZH9HeqqkfP3k88ffe` |
| 390px | Supply | 526 | `egJUCLvVhAP3JKmiKDKn5NqTSUDnXeuLKskdkPxfYktFo7woCGK4zyw3p16YdDC9DzaX16795ZWUzZDyhCxPXzj` |
| 390px | Custody | 713 | `dYoTyrxtov76HcrZ2FwjLMa6dwJC5RCAq5NSn3b8HTHX2LyLCRD6E98aVQjeyCD7J8aqfjVNYJfXPcy7NYeqJUJ` |
| 390px | Metadata | 470 | `4WvqFXP6wzpn3JN9RatY9gBfgExScb8CsTKtf4FwmnA4MKyRWRgVGsDinsrnbCPABXiK1Tr61XjDp7jeB2o1FcTC` |
| 390px | Activation | 527 | `5ZAZfn4dkJQb58QRxZBNqPe7ZooVdapYL9w1jKLuUP9cdX2k9BAQBceLnz6qnyPJHiqR5QnDu3Ug8CsSMRJJpqhp` |
| 1440px | Mint | 464 | `2EEkq6DskR3WjowJAyaWeFoA2dhKTV2NLYKjyYQu6eg1T2s8JZbtXfShbpnXnaJRiFEZBWSobK1eXQpAxd72eFNx` |
| 1440px | Supply | 526 | `5B39ibH5p6qv5tLidEWkXGgbdxX4NwCyauEKaYw1X7V2vpg5h2WPreZSbjdaVWYNGAvzk9XMHZoatHVw1mS2xRZW` |
| 1440px | Custody | 713 | `3ZPczNSQPNSaP626C5zdpZLBt2SsnY6pTb5LuC2kf9ftYYwr3TtmTFHuMPZ45Pi1Mt25fXv1DwPx2D1N7EcASbH` |
| 1440px | Metadata | 472 | `29Krwj5NsEXpTc84Wh7wK71QsZfDtQs5CGnt9Wc7tERkMNrSbbbFhSBvntaP4oLE9CP8uEqrsM9NmFb8YMbPTa1w` |
| 1440px | Activation | 527 | `4TiQgTvrJDzQxN4ZtuWF2G1MYfskjn5rmp9Q7jqogVPyD1qPgBrd6yFcbVsKwYHYennm8z4KAKhkViWZJwGgjEbY` |

## Regression and recovery record

- `JEET_CREATION_STORAGE=pinata npm run test:wallet:creation:browser` passed. Browser rejection groups covered forged images, genesis mismatch, upload failures, concurrent or duplicate creation, rejected signatures and gateway failure. Rejected setup left the independently confirmed mint intact with zero supply and no graduation terms. Resuming after reload reused the upload.
- `npm run test:metadata:local` passed 6 positive and 21 rejection checks, including failed activation rollback, substitutions, and V5 buy/sell conservation. The first attempt conflicted on gossip port 8000. The sequential rerun passed.
- Recovered `npm run test:graduation:local` result was 28 positive and 51 rejection checks. Its migration used 1,158 bytes and 313,132 compute units. The Rust programs and financial logic were unchanged. Prior default/local SBF builds, 13/17 native Rust tests, V5, legacy financial and wallet results remain in the recovery evidence.
- Production builds passed in Work and Codespaces. Work lint, TypeScript, and 43 focused wallet, launch-plan and metadata tests passed, including the 13 storage/pipeline tests.
- Persistent Codespaces storage had 2.4 GB free, with 41 GB free on temporary storage. Pinned validator and official Chromium were restored in temporary storage. Ubuntu runtime libraries were extracted there. Earlier failed runs identified missing Chromium libraries, incorrect UnixFS size assumptions, and a browser assertion shorter than the reader's allowed gateway request time.
- Codespace logs remain in the isolated app copy, including `b-final-live-browser-render.log`, `b-final-app-build-unixfs.log`, `b-final-unixfs-provider.log`, `b-final-metadata-sequential.log`, and `b-final-graduation.log`. The original checkout HEAD and outside-app status were preserved. Remote diff stays within jeet-app-next. The Pinata JWT remained in Codespaces server environment.

This is local acceptance evidence. No installed wallet, Devnet, mainnet, independent audit, or production readiness is claimed.
