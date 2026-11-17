import test from "node:test";
import assert from "node:assert/strict";
import { address, createNoopSigner, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { WALLET_NETWORK, WALLET_PROGRAM_ADDRESS, LOCAL_WALLET_PROGRAM, DEVNET_WALLET_PROGRAM } from "../src/lib/wallet-program.ts";
import { validateWalletEnvironment, DEVNET_GENESIS, MAINNET_GENESIS } from "../src/lib/wallet-environment.ts";
import { localWalletConfiguration } from "../src/lib/local-wallet-server.ts";
import { walletLaunchAddresses, walletLaunchParameters, initializeWalletLaunchInstructions, activateWalletLaunchInstructions } from "../src/lib/wallet-launch.ts";
import { v5PreviewTradeInstruction } from "../src/lib/launch-v5-preview.ts";
import { PLATFORM_TREASURY } from "../src/lib/launch-fees.ts";
const creator = createNoopSigner(address("11111111111111111111111111111112"));
const mint = address("So11111111111111111111111111111111111111112");
const input = { name: "JeeT Test", symbol: "JTEST", uri: "https://example.com/metadata.json", supply: "1000000000", decimals: 9, creatorPercent: "1", capPercent: "1", capEnabled: true, capDuration: 10000n, openingDuration: 100n, openingDelay: 0n, openingLimitBps: 50 };
test("selected network pins program and rejects mainnet or substituted identities", () => {
    const environment = { network: WALLET_NETWORK, chain: "solana:devnet", genesis: WALLET_NETWORK === "devnet" ? DEVNET_GENESIS : mint, program: WALLET_PROGRAM_ADDRESS, rpcPath: "/api/wallet/rpc" };
    assert.equal(validateWalletEnvironment(environment).program, WALLET_NETWORK === "devnet" ? DEVNET_WALLET_PROGRAM : LOCAL_WALLET_PROGRAM);
    assert.throws(() => validateWalletEnvironment({ ...environment, genesis: MAINNET_GENESIS }));
    assert.throws(() => validateWalletEnvironment({ ...environment, program: mint }));
    assert.throws(() => validateWalletEnvironment({ ...environment, network: WALLET_NETWORK === "local" ? "devnet" : "local" }));
});
test("launch PDAs and creation, activation and trade opcodes use selected program", async () => {
    const l = await walletLaunchAddresses(mint, creator.address);
    const p = walletLaunchParameters(input);
    const [expected] = await getProgramDerivedAddress({ programAddress: WALLET_PROGRAM_ADDRESS, seeds: ["launch", new Uint8Array(getAddressEncoder().encode(mint))] });
    assert.equal(l.custody, expected);
    const initialize = initializeWalletLaunchInstructions(creator, l, p);
    assert.deepEqual(initialize.slice(1).map(i => i.data[0]), [0, 2, 16]);
    assert.ok(initialize.slice(1).every(i => i.programAddress === WALLET_PROGRAM_ADDRESS));
    const activation = activateWalletLaunchInstructions(creator, l, p);
    assert.equal(activation.at(-1).programAddress, WALLET_PROGRAM_ADDRESS);
    assert.equal(activation.at(-1).data[0], 21);
    for (const sell of [false, true]) {
        const ix = v5PreviewTradeInstruction({ ...l, buyer: creator, destination: l.creatorAta, receipt: l.opening, amount: 1n, expectedSold: 0n, quotedCost: 1n, maxCost: 2n, sequence: 0n, sell });
        assert.equal(ix.programAddress, WALLET_PROGRAM_ADDRESS);
        assert.equal(ix.data[0], sell ? 20 : 19);
    }
    assert.equal(PLATFORM_TREASURY, "HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP");
});
test("Devnet server requires opt-in and exact HTTPS origin", () => {
    if (WALLET_NETWORK !== "devnet")
        return;
    const previous = { enabled: process.env.JEET_DEVNET_WALLET, origin: process.env.JEET_DEVNET_WALLET_ORIGIN };
    try {
        delete process.env.JEET_DEVNET_WALLET;
        const req = new Request("https://test.example/api/wallet/environment", { headers: { host: "test.example", origin: "https://test.example" } });
        assert.throws(() => localWalletConfiguration(req));
        process.env.JEET_DEVNET_WALLET = "1";
        process.env.JEET_DEVNET_WALLET_ORIGIN = "https://test.example";
        assert.equal(localWalletConfiguration(req).environment.genesis, DEVNET_GENESIS);
        assert.throws(() => localWalletConfiguration(new Request(req, { headers: { host: "evil.example" } })));
        assert.throws(() => localWalletConfiguration(new Request(req, { headers: { host: "test.example", origin: "https://evil.example" } })));
    }
    finally {
        for (const [k, v] of [["JEET_DEVNET_WALLET", previous.enabled], ["JEET_DEVNET_WALLET_ORIGIN", previous.origin]]) {
            if (v === undefined)
                delete process.env[k];
            else
                process.env[k] = v;
        }
    }
});
