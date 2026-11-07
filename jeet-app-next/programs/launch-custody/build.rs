use std::{env, fs, path::PathBuf};

fn main() {
    if env::var_os("CARGO_FEATURE_DEVNET").is_none() {
        return;
    }
    assert!(
        env::var_os("CARGO_FEATURE_LOCAL_FEE_TEST").is_none(),
        "Devnet and local fee-test features are mutually exclusive"
    );
    let program = public_identity("JEET_DEVNET_PROGRAM_ID");
    let treasury = public_identity("JEET_DEVNET_TREASURY");
    assert_ne!(
        program, treasury,
        "Use distinct Devnet program and treasury addresses"
    );
    let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo output directory"));
    fs::write(
        out.join("devnet_identities.rs"),
        format!(
            "solana_program::declare_id!(\"{program}\");\npub const DEVNET_TREASURY: Pubkey = solana_program::pubkey!(\"{treasury}\");\n"
        ),
    )
    .expect("write Devnet public identities");
}

fn public_identity(name: &str) -> String {
    println!("cargo:rerun-if-env-changed={name}");
    let value =
        env::var(name).unwrap_or_else(|_| panic!("Set {name} to a disposable public address"));
    const BASE58: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    assert!(
        (32..=44).contains(&value.len()) && value.bytes().all(|byte| BASE58.contains(&byte)),
        "{name} must be a base58 public address"
    );
    assert!(
        ![
            "11111111111111111111111111111111",
            "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31",
            "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo",
            "HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP",
            "2iXtA8oeZqUU5pofxK971TCEvFGfems2AcDRaZHKD2pQ",
        ]
        .contains(&value.as_str()),
        "{name} must be distinct from system, local and production addresses"
    );
    value
}
