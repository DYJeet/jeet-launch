import { address } from "@solana/kit";
export const LOCAL_WALLET_PROGRAM = "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo";
export const DEVNET_WALLET_PROGRAM = "Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D";
const network = process.env.NEXT_PUBLIC_JEET_WALLET_NETWORK;
if (network && network !== "local" && network !== "devnet")
    throw Error("Unsupported wallet network.");
export const WALLET_NETWORK = network === "devnet" ? "devnet" : "local";
export const WALLET_PROGRAM_ADDRESS = address(WALLET_NETWORK === "devnet" ? DEVNET_WALLET_PROGRAM : LOCAL_WALLET_PROGRAM);
