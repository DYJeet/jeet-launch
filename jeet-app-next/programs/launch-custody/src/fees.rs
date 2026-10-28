//! Versioned, immutable per-launch fee entitlements. Never spend curve reserves.
use super::*;
use solana_program::{
    log::sol_log_data,
    program::{invoke, set_return_data},
    pubkey,
};
pub const LEN: usize = 153;
pub const MAGIC: &[u8] = b"JEETFEE1";
#[cfg(not(feature = "local-fee-test"))]
pub const TREASURY: Pubkey = pubkey!("HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP");
#[cfg(feature = "local-fee-test")]
pub const TREASURY: Pubkey = pubkey!("2iXtA8oeZqUU5pofxK971TCEvFGfems2AcDRaZHKD2pQ");
fn err(n: u32) -> ProgramError {
    ProgramError::Custom(n)
}
fn read(d: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(d[o..o + 8].try_into().unwrap())
}
pub fn amounts(raw: u64) -> Result<(u64, u64, u64), ProgramError> {
    if raw == 0 {
        return Err(err(1301));
    }
    let part = |bps: u128| -> Result<u64, ProgramError> {
        let n = u128::from(raw).checked_mul(bps).ok_or(err(1308))?;
        u64::try_from(
            (n / 10000)
                .checked_add(u128::from(n % 10000 != 0))
                .ok_or(err(1308))?,
        )
        .map_err(|_| err(1308))
    };
    let p = part(75)?;
    let c = part(25)?;
    let total = raw
        .checked_add(p)
        .and_then(|n| n.checked_add(c))
        .ok_or(err(1308))?;
    Ok((p, c, total))
}
pub fn pda(program: &Pubkey, mint: &Pubkey, kind: u8) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"fee", mint.as_ref(), &[kind]], program)
}
pub fn load(
    program: &Pubkey,
    mint: &Pubkey,
    curve: &Pubkey,
    account: &AccountInfo,
    kind: u8,
    beneficiary: &Pubkey,
) -> Result<(u64, u64), ProgramError> {
    let (key, bump) = pda(program, mint, kind);
    let d = account.try_borrow_data()?;
    if account.key != &key
        || account.owner != program
        || account.executable
        || d.len() != LEN
        || &d[..8] != MAGIC
        || &d[8..40] != mint.as_ref()
        || &d[40..72] != curve.as_ref()
        || &d[72..104] != beneficiary.as_ref()
        || d[104] != kind
        || d[152] != bump
    {
        return Err(err(1302));
    }
    let accrued = read(&d, 105);
    let withdrawn = read(&d, 113);
    let liability = accrued.checked_sub(withdrawn).ok_or(err(1308))?;
    if read(&d, 121) != liability
        || d[129..152].iter().any(|b| *b != 0)
        || account.lamports()
            < Rent::get()?
                .minimum_balance(LEN)
                .checked_add(liability)
                .ok_or(err(1308))?
    {
        return Err(err(1303));
    }
    Ok((accrued, withdrawn))
}
pub fn creator(custody: &AccountInfo) -> Result<Pubkey, ProgramError> {
    Ok(Pubkey::new_from_array(
        custody.try_borrow_data()?[40..72].try_into().unwrap(),
    ))
}
pub fn initialize(program: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
    // Curve initialization op7: protected V3 + platform vault + creator vault + creator signer.
    if accounts.len() != 10 || input.len() != 35 {
        return Err(err(1300));
    }
    let payer = &accounts[0];
    let mint = &accounts[1];
    let custody = &accounts[2];
    let curve = &accounts[4];
    let system = &accounts[6];
    super::caps::custody(custody, mint, program)?;
    let beneficiary = creator(custody)?;
    if !accounts[9].is_signer || accounts[9].key != &beneficiary {
        return Err(err(1304));
    }
    for (kind, recipient, account) in [(0, TREASURY, &accounts[7]), (1, beneficiary, &accounts[8])]
    {
        let (key, bump) = pda(program, mint.key, kind);
        if account.key != &key || !account.is_writable {
            return Err(err(1302));
        }
        super::caps::allocate(
            payer,
            account,
            system,
            program,
            LEN,
            &[b"fee", mint.key.as_ref(), &[kind], &[bump]],
        )?;
        let mut d = account.try_borrow_mut_data()?;
        d.fill(0);
        d[..8].copy_from_slice(MAGIC);
        d[8..40].copy_from_slice(mint.key.as_ref());
        d[40..72].copy_from_slice(curve.key.as_ref());
        d[72..104].copy_from_slice(recipient.as_ref());
        d[104] = kind;
        d[152] = bump;
    }
    Ok(())
}
pub fn collect<'a>(
    program: &Pubkey,
    accounts: &[AccountInfo<'a>],
    raw: u64,
    max: u64,
) -> ProgramResult {
    if accounts.len() != 12 {
        return Err(err(1300));
    }
    let buyer = &accounts[0];
    let mint = &accounts[1];
    let custody = &accounts[2];
    let curve = &accounts[9];
    let system = &accounts[7];
    let recipient = creator(custody)?;
    let (p, c, total) = amounts(raw)?;
    if total > max {
        return Err(err(1305));
    }
    if buyer.lamports() < total {
        return Err(err(1106));
    }
    for (kind, beneficiary, account, amount) in [
        (0, TREASURY, &accounts[10], p),
        (1, recipient, &accounts[11], c),
    ] {
        if !account.is_writable {
            return Err(err(1302));
        }
        let (accrued, withdrawn) = load(program, mint.key, curve.key, account, kind, &beneficiary)?;
        let next = accrued.checked_add(amount).ok_or(err(1308))?;
        account.lamports().checked_add(amount).ok_or(err(1308))?;
        invoke(
            &system_instruction::transfer(buyer.key, account.key, amount),
            &[buyer.clone(), account.clone(), system.clone()],
        )?;
        let mut d = account.try_borrow_mut_data()?;
        d[105..113].copy_from_slice(&next.to_le_bytes());
        d[121..129].copy_from_slice(&next.checked_sub(withdrawn).ok_or(err(1308))?.to_le_bytes());
    }
    sol_log_data(&[
        b"JEET_TRADE_FEE_V1",
        mint.key.as_ref(),
        buyer.key.as_ref(),
        &raw.to_le_bytes(),
        &p.to_le_bytes(),
        &c.to_le_bytes(),
        &total.to_le_bytes(),
    ]);
    Ok(())
}
pub fn process(program: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
    match input.first() {
        Some(9) => {
            // On-chain fee quote. Preserve legacy raw-curve quote op5 unchanged.
            if input.len() != 9 || accounts.len() != 7 {
                return Err(err(1300));
            }
            let c = super::curve::load(
                program,
                &accounts[0],
                &accounts[1],
                &accounts[2],
                &accounts[3],
                &accounts[4],
            )?;
            if !c.fees {
                return Err(err(1306));
            }
            let mint = &accounts[0];
            let curve = &accounts[3];
            load(program, mint.key, curve.key, &accounts[5], 0, &TREASURY)?;
            load(
                program,
                mint.key,
                curve.key,
                &accounts[6],
                1,
                &creator(&accounts[1])?,
            )?;
            let n = read(input, 1);
            if n > c.inventory.checked_sub(c.sold).ok_or(err(1108))? {
                return Err(err(1110));
            }
            let raw = super::curve::cost(&c, n)?;
            let (p, cr, total) = amounts(raw)?;
            let mut d = [0u8; 56];
            for (i, v) in [raw, p, cr, total, c.sold, c.collected, n]
                .iter()
                .enumerate()
            {
                d[i * 8..i * 8 + 8].copy_from_slice(&v.to_le_bytes());
            }
            set_return_data(&d);
            Ok(())
        }
        Some(10) => {
            // kind, exact positive amount; beneficiary signer, mint, custody, curve, fee vault.
            if input.len() != 10 || accounts.len() != 5 || input[1] > 1 {
                return Err(err(1300));
            }
            let who = &accounts[0];
            let mint = &accounts[1];
            let custody = &accounts[2];
            let curve = &accounts[3];
            let vault = &accounts[4];
            super::caps::custody(custody, mint, program)?;
            let (curve_key, _) =
                Pubkey::find_program_address(&[b"curve", mint.key.as_ref()], program);
            let data = curve.try_borrow_data()?;
            let supported = (data.len() == super::protected::LEN
                && &data[..8] == super::curve::FEE_MAGIC)
                || (data.len() == super::market::LEN && &data[..8] == super::market::MAGIC);
            if curve.key != &curve_key || curve.owner != program || !supported {
                return Err(err(1302));
            }
            drop(data);
            let beneficiary = if input[1] == 0 {
                TREASURY
            } else {
                creator(custody)?
            };
            if who.key != &beneficiary
                || !who.is_signer
                || !who.is_writable
                || who.owner != &system_program::id()
                || !who.data_is_empty()
                || !vault.is_writable
            {
                return Err(err(1304));
            }
            let (earned, withdrawn) =
                load(program, mint.key, curve.key, vault, input[1], &beneficiary)?;
            let amount = read(input, 2);
            let available = earned.checked_sub(withdrawn).ok_or(err(1308))?;
            if amount == 0 || amount > available {
                return Err(err(1307));
            }
            let next = withdrawn.checked_add(amount).ok_or(err(1308))?;
            let balance = vault.lamports().checked_sub(amount).ok_or(err(1308))?;
            let destination = who.lamports().checked_add(amount).ok_or(err(1308))?;
            **vault.try_borrow_mut_lamports()? = balance;
            **who.try_borrow_mut_lamports()? = destination;
            let mut d = vault.try_borrow_mut_data()?;
            d[113..121].copy_from_slice(&next.to_le_bytes());
            d[121..129].copy_from_slice(
                &available
                    .checked_sub(amount)
                    .ok_or(err(1308))?
                    .to_le_bytes(),
            );
            sol_log_data(&[
                b"JEET_FEE_CLAIM_V1",
                mint.key.as_ref(),
                who.key.as_ref(),
                &[input[1]],
                &amount.to_le_bytes(),
                &next.to_le_bytes(),
            ]);
            Ok(())
        }
        _ => Err(err(1300)),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fixtures() {
        assert_eq!(amounts(1).unwrap(), (1, 1, 3));
        assert_eq!(amounts(400).unwrap(), (3, 1, 404));
        assert_eq!(amounts(10000).unwrap(), (75, 25, 10100));
        assert_eq!(amounts(10001).unwrap(), (76, 26, 10103));
        assert!(amounts(0).is_err());
        assert!(amounts(u64::MAX).is_err());
    }
    #[test]
    fn splitting_cannot_reduce_fees() {
        for a in 1..200 {
            for b in 1..200 {
                let (x, y, _) = amounts(a).unwrap();
                let (p, c, _) = amounts(b).unwrap();
                let (q, r, _) = amounts(a + b).unwrap();
                assert!(x + p >= q && y + c >= r);
            }
        }
    }
}
