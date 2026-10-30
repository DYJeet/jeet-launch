//! Non-financial metadata extension, enabled only in disposable local builds.
use super::*;
use solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
const MPL: Pubkey = solana_program::pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
fn e(n: u32) -> ProgramError {
    ProgramError::Custom(n)
}
fn field<'a>(d: &'a [u8], p: &mut usize, max: usize, wide: bool) -> Result<&'a str, ProgramError> {
    let end = p
        .checked_add(if wide { 4 } else { 1 })
        .filter(|n| *n <= d.len())
        .ok_or(e(1620))?;
    let n = if wide {
        u32::from_le_bytes(d[*p..end].try_into().unwrap()) as usize
    } else {
        usize::from(d[*p])
    };
    *p = end;
    let end = p.checked_add(n).filter(|n| *n <= d.len()).ok_or(e(1620))?;
    if n > max {
        return Err(e(1624));
    }
    let s = std::str::from_utf8(&d[*p..end]).map_err(|_| e(1624))?;
    *p = end;
    Ok(s)
}
fn validate(n: &str, s: &str, u: &str) -> ProgramResult {
    if n.trim().is_empty()
        || n.len() > 32
        || n.chars().any(char::is_control)
        || s.is_empty()
        || s.len() > 10
        || !s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
        || u.len() > 200
        || u.chars().any(|c| c.is_control() || c.is_whitespace())
        || ![
            "https://",
            "ipfs://",
            "ar://",
            "http://127.0.0.1:",
            "http://127.0.0.1/",
        ]
        .iter()
        .any(|p| u.starts_with(p) && u.len() > p.len())
    {
        return Err(e(1624));
    }
    Ok(())
}
pub fn process(program: &Pubkey, a: &[AccountInfo], d: &[u8]) -> ProgramResult {
    if d.len() < 13 || d[0] != 23 || a.len() != 7 {
        return Err(e(1620));
    }
    let caller = &a[0];
    if !caller.is_signer || !caller.is_writable {
        return Err(e(1623));
    }
    if caller.owner != &system_program::id()
        || !caller.data_is_empty()
        || a[4].key != &system_program::id()
        || !a[4].executable
        || a[5].key != &solana_program::sysvar::rent::id()
        || a[6].key != &MPL
        || !a[6].executable
    {
        return Err(e(1621));
    }
    super::caps::custody(&a[2], &a[1], program)?;
    let mint = Mint::unpack(&a[1].try_borrow_data()?)?;
    if caller.key != &super::fees::creator(&a[2])?
        || mint.mint_authority != COption::Some(*caller.key)
    {
        return Err(e(1623));
    }
    let (key, _) =
        Pubkey::find_program_address(&[b"metadata", MPL.as_ref(), a[1].key.as_ref()], &MPL);
    if a[3].key != &key || !a[3].is_writable {
        return Err(e(1621));
    }
    if a[3].owner != &system_program::id() || !a[3].data_is_empty() {
        return Err(e(1622));
    }
    let budget = u64::from_le_bytes(d[1..9].try_into().unwrap());
    let mutable = d[9];
    if mutable > 1 {
        return Err(e(1624));
    }
    let mut p = 10;
    let name = field(d, &mut p, 32, false)?;
    let symbol = field(d, &mut p, 10, false)?;
    let uri = field(d, &mut p, 200, false)?;
    if p != d.len() {
        return Err(e(1620));
    }
    validate(name, symbol, uri)?;
    let mut data = vec![33];
    for s in [name, symbol, uri] {
        data.extend_from_slice(&(s.len() as u32).to_le_bytes());
        data.extend_from_slice(s.as_bytes());
    }
    data.extend_from_slice(&[0, 0, 0, 0, 0, mutable, 0]);
    let before = caller.lamports();
    invoke(
        &Instruction {
            program_id: MPL,
            data,
            accounts: vec![
                AccountMeta::new(*a[3].key, false),
                AccountMeta::new_readonly(*a[1].key, false),
                AccountMeta::new_readonly(*caller.key, true),
                AccountMeta::new(*caller.key, true),
                AccountMeta::new_readonly(*caller.key, false),
                AccountMeta::new_readonly(*a[4].key, false),
                AccountMeta::new_readonly(*a[5].key, false),
            ],
        },
        &[
            a[3].clone(),
            a[1].clone(),
            caller.clone(),
            a[4].clone(),
            a[5].clone(),
            a[6].clone(),
        ],
    )?;
    let cost = before.checked_sub(caller.lamports()).ok_or(e(1626))?;
    if cost > budget {
        return Err(e(1625));
    }
    let b = a[3].try_borrow_data()?;
    if a[3].owner != &MPL
        || b.len() < 65
        || b[0] != 4
        || &b[1..33] != caller.key.as_ref()
        || &b[33..65] != a[1].key.as_ref()
    {
        return Err(e(1627));
    }
    let mut p = 65;
    for (expected, max) in [(name, 32), (symbol, 10), (uri, 200)] {
        if field(&b, &mut p, max, true)?.trim_end_matches('\0') != expected {
            return Err(e(1627));
        }
    }
    let end = p.checked_add(5).filter(|n| *n <= b.len()).ok_or(e(1627))?;
    if b[p..end] != [0, 0, 0, 0, mutable] {
        return Err(e(1627));
    }
    solana_program::log::sol_log_data(&[
        b"JEET_METADATA_V1",
        a[1].key.as_ref(),
        a[3].key.as_ref(),
        &cost.to_le_bytes(),
    ]);
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn valid_and_invalid_fields() {
        assert!(validate("JeeT", "JEET", "https://example.com/a.json").is_ok());
        for (n, s, u) in [
            ("", "J", "https://x"),
            ("a", "!", "https://x"),
            ("a", "J", "javascript:x"),
            ("a\0", "J", "https://x"),
            ("a", "J", "https://x/ a"),
        ] {
            assert!(validate(n, s, u).is_err());
        }
    }
    #[test]
    fn bounded_parser() {
        let mut p = 0;
        assert!(field(&[255], &mut p, 32, false).is_err());
        let mut p = 0;
        assert!(field(&[2, 0, 0, 0, 255, 255], &mut p, 32, true).is_err());
    }
}
