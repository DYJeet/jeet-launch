use std::{env, fs, path::PathBuf};

fn main() {
    if env::var_os("CARGO_FEATURE_MAINNET").is_some() {
        assert!(
            env::var_os("CARGO_FEATURE_DEVNET").is_none()
                && env::var_os("CARGO_FEATURE_LOCAL_FEE_TEST").is_none(),
            "Mainnet, Devnet and local fee-test features are mutually exclusive"
        );
        let program = public_identity("JEET_MAINNET_PROGRAM_ID");
        let authority = public_identity("JEET_MAINNET_CONTAINMENT_AUTHORITY");
        assert_ne!(program, authority, "Use a distinct Mainnet containment authority");
        let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo output directory"));
        fs::write(
            out.join("mainnet_identities.rs"),
            format!("solana_program::declare_id!(\"{program}\");\npub const CONTAINMENT_AUTHORITY: Pubkey = solana_program::pubkey!(\"{authority}\");\n"),
        )
        .expect("write Mainnet public identities");
        return;
    }
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
        env::var(name).unwrap_or_else(|_| panic!("Set {name} to an explicit public address"));
    const BASE58: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    assert!(
        (32..=44).contains(&value.len()) && value.bytes().all(|byte| BASE58.contains(&byte)),
        "{name} must be a base58 public address"
    );
    if name == "JEET_DEVNET_TREASURY" {
        assert_eq!(value, "HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP",
            "Devnet treasury must match the approved beneficiary");
        return value;
    }
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
    if name.starts_with("JEET_MAINNET_") {
        assert!(
            ![
                "Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D",
                "DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW",
                "BAZK4s9BBN3x4XGhjG3tj4P6jGky8cnNHBUdMsoHGFyg",
                "13TckZDu8H8VAXSmkfGqVKMwbeWoJsrsBSk5i1KkA1Uf",
                "9m9k7oUP2EpVhgPXtrAsFTYE6WY6kaq8w67QvkWKjx9b",
                "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
                "DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8",
            ]
            .contains(&value.as_str()),
            "Use a dedicated Mainnet identity instead of a known Devnet or dependency address"
        );
    }
    value
}
