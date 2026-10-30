// Read-only clone of the reviewed public Devnet deployment; never sends a transaction.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getAddressDecoder } from "@solana/kit";
const url = "https://api.devnet.solana.com",
  program = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  loader = "BPFLoaderUpgradeab1e11111111111111111111111",
  expected = "bb0842f6d5740eabe8f9fb3b723b9ecd89cadf9f48ef9ad6a9dc6cfa8a9658e4";
const rpc = (method, params = []) => {
  const result = JSON.parse(
    execFileSync(
      "curl",
      [
        "--fail",
        "--silent",
        "--show-error",
        "--max-time",
        "30",
        "--retry",
        "2",
        url,
        "-H",
        "content-type: application/json",
        "--data-binary",
        "@-",
      ],
      {
        input: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        maxBuffer: 16 * 1024 * 1024,
      },
    ).toString(),
  );
  if (result.error) throw Error(JSON.stringify(result.error));
  return result.result;
};
if (rpc("getGenesisHash") !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG")
  throw Error("Expected public Devnet");
const deployment = rpc("getAccountInfo", [
    program,
    { encoding: "base64", commitment: "confirmed" },
  ]),
  a = deployment.value,
  d = Buffer.from(a.data[0], "base64");
if (
  a.owner !== loader ||
  !a.executable ||
  d.length !== 36 ||
  d.readUInt32LE() !== 2
)
  throw Error("Unexpected metadata deployment");
const programData = getAddressDecoder().decode(d.subarray(4, 36)),
  account = rpc("getAccountInfo", [
    programData,
    { encoding: "base64", commitment: "confirmed" },
  ]),
  b = Buffer.from(account.value.data[0], "base64");
if (
  account.value.owner !== loader ||
  b.readUInt32LE() !== 3 ||
  b.subarray(45, 49).toString("hex") !== "7f454c46"
)
  throw Error("Invalid program data ELF");
const elf = b.subarray(45),
  sha256 = createHash("sha256").update(elf).digest("hex");
if (sha256 !== expected)
  throw Error(
    "Public deployment changed: " +
      sha256 +
      "; review before replacing pinned fixture",
  );
const dir = "programs/launch-custody/target/metadata-research";
await mkdir(dir, { recursive: true });
await writeFile(dir + "/mpl_token_metadata.so", elf);
await writeFile(
  dir + "/provenance.json",
  JSON.stringify(
    {
      origin:
        "Read-only Devnet deployment clone, not a reproduced source build",
      program,
      programData,
      observedSlot: account.context.slot,
      deployedSlot: b.readBigUInt64LE(4).toString(),
      upgradeAuthority:
        b[12] === 1 ? getAddressDecoder().decode(b.subarray(13, 45)) : null,
      sha256,
      interfaceCommit: "024a6f45a443389815cbfa8855fc1796bc89e4b3",
    },
    null,
    2,
  ),
);
console.log("Verified deployment clone " + sha256);
