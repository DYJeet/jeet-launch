//! Explicit V4 market: reversible net pricing cursor, irreversible gross cap receipts.
//! Existing V1/V2/V3 records and entry points retain their verified semantics.
use super::*;
use solana_program::{
    clock::Clock,
    log::sol_log_data,
    program::{invoke, set_return_data},
};
pub const MAGIC: &[u8] = b"JEETCRV4";
pub const LEN: usize = 245;
fn err(code: u32) -> ProgramError {
    ProgramError::Custom(code)
}
fn read(d: &[u8], n: usize) -> u64 {
    u64::from_le_bytes(d[n..n + 8].try_into().unwrap())
}
#[derive(Clone, Copy)]
pub struct Market {
    pub curve: super::curve::Curve,
    pub raw_in: u64,
    pub raw_out: u64,
    pub returned: u64,
    pub sequence: u64,
    pub completed: bool,
}
/// Independent total-fee rounding; a shared per-launch carry preserves 3:1 lifetime allocation.
pub fn fee_parts(raw: u64, p: u64, c: u64) -> Result<(u64, u64), ProgramError> {
    if raw == 0 {
        return Err(err(1403));
    }
    let before = p.checked_add(c).ok_or(err(1407))?;
    let target = |f: u64| -> Result<u64, ProgramError> {
        u64::try_from(
            u128::from(f)
                .checked_mul(3)
                .and_then(|v| v.checked_add(3))
                .ok_or(err(1407))?
                / 4,
        )
        .map_err(|_| err(1407))
    };
    if p != target(before)? {
        return Err(err(1412));
    }
    let total = u64::try_from((u128::from(raw).checked_add(99).ok_or(err(1407))?) / 100)
        .map_err(|_| err(1407))?;
    let next = before.checked_add(total).ok_or(err(1407))?;
    let next_p = target(next)?;
    let dp = next_p.checked_sub(p).ok_or(err(1407))?;
    let dc = next
        .checked_sub(next_p)
        .and_then(|v| v.checked_sub(c))
        .ok_or(err(1407))?;
    if dp.checked_add(dc) != Some(total) {
        return Err(err(1412));
    }
    Ok((dp, dc))
}
/// floor of the exact marginal integral over the last n token base units.
pub fn redemption(c: &super::curve::Curve, n: u64) -> Result<u64, ProgramError> {
    if n == 0 || n > c.sold {
        return Err(err(1403));
    }
    let start = u128::from(c.sold.checked_sub(n).ok_or(err(1407))?);
    let n = u128::from(n);
    let q = u128::from(c.scale);
    let series = n
        .checked_mul(n.checked_sub(1).ok_or(err(1407))?)
        .and_then(|v| v.checked_div(2))
        .and_then(|v| start.checked_mul(n).and_then(|s| s.checked_add(v)))
        .ok_or(err(1407))?;
    let initial = u128::from(c.base)
        .checked_mul(n)
        .and_then(|v| v.checked_mul(q))
        .ok_or(err(1407))?;
    let value = u128::from(c.slope)
        .checked_mul(series)
        .and_then(|v| v.checked_add(initial))
        .ok_or(err(1407))?;
    let denominator = q.checked_mul(q).filter(|v| *v > 0).ok_or(err(1407))?;
    u64::try_from(value / denominator).map_err(|_| err(1407))
}
fn load(
    program: &Pubkey,
    mint: &AccountInfo,
    custody: &AccountInfo,
    opening: &AccountInfo,
    curve: &AccountInfo,
    vault: &AccountInfo,
) -> Result<Market, ProgramError> {
    let (creator, inventory) = super::caps::custody(custody, mint, program)?;
    let minted = Mint::unpack(&mint.try_borrow_data()?)?;
    let (key, bump) = Pubkey::find_program_address(&[b"curve", mint.key.as_ref()], program);
    let (open_key, open_bump) =
        Pubkey::find_program_address(&[b"opening", mint.key.as_ref()], program);
    let d = curve.try_borrow_data()?;
    let o = opening.try_borrow_data()?;
    if curve.key != &key
        || curve.owner != program
        || curve.executable
        || d.len() != LEN
        || &d[..8] != MAGIC
        || &d[8..40] != mint.key.as_ref()
        || &d[40..72] != custody.key.as_ref()
        || &d[72..104] != opening.key.as_ref()
        || d[152] != bump
        || opening.key != &open_key
        || opening.owner != program
        || o.len() != 108
        || &o[..8] != b"JEETOPN1"
        || &o[8..40] != mint.key.as_ref()
        || &o[40..72] != custody.key.as_ref()
        || o[105] != open_bump
        || o[96] > 1
        || minted.decimals > 9
        || creator.checked_add(inventory) != Some(minted.supply)
    {
        return Err(err(1401));
    }
    let c = super::curve::Curve {
        fees: true,
        base: read(&d, 104),
        slope: read(&d, 112),
        scale: read(&d, 120),
        sold: read(&d, 128),
        collected: read(&d, 136),
        inventory: read(&d, 144),
        protection: Some(super::protected::decode(
            &d[..204],
            minted.supply,
            inventory,
            &o,
        )?),
    };
    let m = Market {
        curve: c,
        raw_in: read(&d, 204),
        raw_out: read(&d, 212),
        returned: read(&d, 220),
        sequence: read(&d, 228),
        completed: d[236] == 1,
    };
    if c.base == 0
        || c.scale != 10u64.pow(u32::from(minted.decimals))
        || c.inventory != inventory
        || c.sold > inventory
        || c.sold.checked_add(m.returned) != Some(read(&o, 97))
        || m.raw_in.checked_sub(m.raw_out) != Some(c.collected)
        || d[236] > 1
        || read(&d, 237) != inventory
        || (!m.completed && c.sold == inventory)
        || (m.sequence == 0 && (m.raw_in != 0 || m.returned != 0 || read(&o, 97) != 0))
    {
        return Err(err(1410));
    }
    if vault_check(vault, custody.key, mint.key)
        .map_err(|_| err(1401))?
        .amount
        < inventory.checked_sub(c.sold).ok_or(err(1407))?
    {
        return Err(err(1410));
    }
    if curve.lamports()
        < Rent::get()?
            .minimum_balance(LEN)
            .checked_add(c.collected)
            .ok_or(err(1407))?
    {
        return Err(err(1406));
    }
    Ok(m)
}
fn fee_state(
    program: &Pubkey,
    mint: &AccountInfo,
    custody: &AccountInfo,
    curve: &AccountInfo,
    p: &AccountInfo,
    c: &AccountInfo,
) -> Result<(u64, u64), ProgramError> {
    let (pa, _) = super::fees::load(program, mint.key, curve.key, p, 0, &super::fees::TREASURY)?;
    let (ca, _) = super::fees::load(
        program,
        mint.key,
        curve.key,
        c,
        1,
        &super::fees::creator(custody)?,
    )?;
    Ok((pa, ca))
}
fn accrual(account: &AccountInfo, amount: u64) -> ProgramResult {
    let mut d = account.try_borrow_mut_data()?;
    let next = read(&d, 105).checked_add(amount).ok_or(err(1407))?;
    let liability = next.checked_sub(read(&d, 113)).ok_or(err(1407))?;
    d[105..113].copy_from_slice(&next.to_le_bytes());
    d[121..129].copy_from_slice(&liability.to_le_bytes());
    Ok(())
}
fn receipt(
    program: &Pubkey,
    mint: &Pubkey,
    wallet: &Pubkey,
    account: &AccountInfo,
) -> Result<(u64, u8), ProgramError> {
    let (key, bump) =
        Pubkey::find_program_address(&[b"buyer", mint.as_ref(), wallet.as_ref()], program);
    if account.key != &key {
        return Err(err(1401));
    }
    if account.owner == program {
        let d = account.try_borrow_data()?;
        if d.len() != 81
            || &d[..8] != b"JEETBUY1"
            || &d[8..40] != mint.as_ref()
            || &d[40..72] != wallet.as_ref()
            || d[80] != bump
        {
            return Err(err(1401));
        }
        Ok((read(&d, 72), bump))
    } else if account.owner == &system_program::id() && account.data_is_empty() {
        Ok((0, bump))
    } else {
        Err(err(1401))
    }
}
fn emit(
    mint: &Pubkey,
    wallet: &Pubkey,
    sell: bool,
    n: u64,
    economics: (u64, u64, u64, u64),
    m: &Market,
) {
    let (raw, p, c, user) = economics;
    sol_log_data(&[
        b"JEET_MARKET_TRADE_V1",
        mint.as_ref(),
        wallet.as_ref(),
        &[u8::from(sell)],
        &n.to_le_bytes(),
        &raw.to_le_bytes(),
        &p.to_le_bytes(),
        &c.to_le_bytes(),
        &user.to_le_bytes(),
        &m.curve.sold.to_le_bytes(),
        &m.curve.collected.to_le_bytes(),
        &m.sequence.to_le_bytes(),
    ]);
}
pub fn process(program: &Pubkey, a: &[AccountInfo], input: &[u8]) -> ProgramResult {
    match input.first() {
        Some(11) => {
            if input.len() != 35 || a.len() != 10 {
                return Err(err(1400));
            }
            let mut base = input.to_vec();
            base[0] = 7;
            super::curve::process(program, a, &base)?;
            let payer = &a[0];
            let curve = &a[4];
            let system = &a[6];
            let rent = Rent::get()?.minimum_balance(LEN);
            if curve.lamports() < rent {
                invoke(
                    &system_instruction::transfer(
                        payer.key,
                        curve.key,
                        rent.checked_sub(curve.lamports()).ok_or(err(1407))?,
                    ),
                    &[payer.clone(), curve.clone(), system.clone()],
                )?;
            }
            curve.resize(LEN)?;
            let mut d = curve.try_borrow_mut_data()?;
            d[..8].copy_from_slice(MAGIC);
            d[204..].fill(0);
            let inventory = read(&d, 144);
            d[237..245].copy_from_slice(&inventory.to_le_bytes());
            sol_log_data(&[
                b"JEET_MARKET_INIT_V1",
                a[1].key.as_ref(),
                payer.key.as_ref(),
            ]);
            Ok(())
        }
        Some(13 | 14) => {
            if input.len() != 9 || a.len() != 7 {
                return Err(err(1400));
            }
            let m = load(program, &a[0], &a[1], &a[2], &a[3], &a[4])?;
            let n = read(input, 1);
            let sell = input[0] == 14;
            if n == 0
                || (!sell
                    && n > m
                        .curve
                        .inventory
                        .checked_sub(m.curve.sold)
                        .ok_or(err(1407))?)
            {
                return Err(err(1403));
            }
            if !sell && m.completed {
                return Err(err(1405));
            }
            let raw = if sell {
                redemption(&m.curve, n)?
            } else {
                super::curve::cost(&m.curve, n)?
            };
            let (pa, ca) = fee_state(program, &a[0], &a[1], &a[3], &a[5], &a[6])?;
            let (p, c) = fee_parts(raw, pa, ca)?;
            let fees = p.checked_add(c).ok_or(err(1407))?;
            let user = if sell {
                raw.checked_sub(fees).filter(|v| *v > 0).ok_or(err(1409))?
            } else {
                raw.checked_add(fees).ok_or(err(1407))?
            };
            if sell && raw > m.curve.collected {
                return Err(err(1406));
            }
            let mut out = [0u8; 80];
            for (i, v) in [
                raw,
                p,
                c,
                user,
                m.curve.sold,
                m.curve.collected,
                n,
                m.sequence,
                m.raw_in,
                m.raw_out,
            ]
            .iter()
            .enumerate()
            {
                out[i * 8..i * 8 + 8].copy_from_slice(&v.to_le_bytes());
            }
            set_return_data(&out);
            Ok(())
        }
        Some(12 | 15) => {
            if input.len() != 41 || a.len() != 12 {
                return Err(err(1400));
            }
            let sell = input[0] == 15;
            let wallet = &a[0];
            let mint = &a[1];
            let custody = &a[2];
            let vault = &a[3];
            let token_account = &a[4];
            let opening = &a[5];
            let buyer_receipt = &a[6];
            let system = &a[7];
            let token_program = &a[8];
            let curve = &a[9];
            let platform = &a[10];
            let creator = &a[11];
            if !wallet.is_signer {
                return Err(err(1402));
            }
            if !wallet.is_writable
                || wallet.owner != &system_program::id()
                || !wallet.data_is_empty()
                || !vault.is_writable
                || !token_account.is_writable
                || !curve.is_writable
                || !platform.is_writable
                || !creator.is_writable
                || (!sell && (!opening.is_writable || !buyer_receipt.is_writable))
                || system.key != &system_program::id()
                || !system.executable
                || token_program.key != &spl_token::id()
                || !token_program.executable
            {
                return Err(err(1401));
            }
            let mut m = load(program, mint, custody, opening, curve, vault)?;
            let t = token(token_account).map_err(|_| err(1401))?;
            if token_account.key == vault.key
                || t.mint != *mint.key
                || t.owner != *wallet.key
                || t.state != AccountState::Initialized
            {
                return Err(err(1401));
            }
            let (received, bump) = receipt(program, mint.key, wallet.key, buyer_receipt)?;
            let n = read(input, 1);
            if n == 0 {
                return Err(err(1403));
            }
            if read(input, 9) != m.curve.sold || read(input, 33) != m.sequence {
                return Err(err(1404));
            }
            let phase = m.curve.protection.ok_or(err(1410))?;
            let slot = Clock::get()?.slot;
            if slot < phase.start {
                return Err(err(1200));
            }
            let raw = if sell {
                if t.amount < n {
                    return Err(err(1413));
                }
                redemption(&m.curve, n)?
            } else {
                if m.completed {
                    return Err(err(1405));
                }
                let next = received.checked_add(n).ok_or(err(1407))?;
                let open = opening.try_borrow_data()?;
                if open[96] == 1 && slot < read(&open, 88) && next > read(&open, 72) {
                    return Err(err(1005));
                }
                phase.enforce(slot, next)?;
                if n > m
                    .curve
                    .inventory
                    .checked_sub(m.curve.sold)
                    .ok_or(err(1407))?
                {
                    return Err(err(1403));
                }
                super::curve::cost(&m.curve, n)?
            };
            if raw != read(input, 17) {
                return Err(err(1408));
            }
            let (pa, ca) = fee_state(program, mint, custody, curve, platform, creator)?;
            let (p, c) = fee_parts(raw, pa, ca)?;
            let fee = p.checked_add(c).ok_or(err(1407))?;
            let user = if sell {
                raw.checked_sub(fee).filter(|v| *v > 0).ok_or(err(1409))?
            } else {
                raw.checked_add(fee).ok_or(err(1407))?
            };
            if (sell && user < read(input, 25)) || (!sell && user > read(input, 25)) {
                return Err(err(1408));
            }
            let next_sequence = m.sequence.checked_add(1).ok_or(err(1407))?;
            let minted = Mint::unpack(&mint.try_borrow_data()?)?;
            if sell {
                if raw > m.curve.collected {
                    return Err(err(1406));
                }
                let next_reserve = m.curve.collected.checked_sub(raw).ok_or(err(1407))?;
                let next_balance = curve.lamports().checked_sub(raw).ok_or(err(1407))?;
                if next_balance
                    < Rent::get()?
                        .minimum_balance(LEN)
                        .checked_add(next_reserve)
                        .ok_or(err(1407))?
                {
                    return Err(err(1406));
                }
                let wallet_balance = wallet.lamports().checked_add(user).ok_or(err(1407))?;
                let pb = platform.lamports().checked_add(p).ok_or(err(1407))?;
                let cb = creator.lamports().checked_add(c).ok_or(err(1407))?;
                invoke(
                    &spl_token::instruction::transfer_checked(
                        &spl_token::id(),
                        token_account.key,
                        mint.key,
                        vault.key,
                        wallet.key,
                        &[],
                        n,
                        minted.decimals,
                    )?,
                    &[
                        token_account.clone(),
                        mint.clone(),
                        vault.clone(),
                        wallet.clone(),
                        token_program.clone(),
                    ],
                )?;
                **curve.try_borrow_mut_lamports()? = next_balance;
                **wallet.try_borrow_mut_lamports()? = wallet_balance;
                **platform.try_borrow_mut_lamports()? = pb;
                **creator.try_borrow_mut_lamports()? = cb;
                m.curve.sold = m.curve.sold.checked_sub(n).ok_or(err(1407))?;
                m.curve.collected = next_reserve;
                m.raw_out = m.raw_out.checked_add(raw).ok_or(err(1407))?;
                m.returned = m.returned.checked_add(n).ok_or(err(1407))?;
            } else {
                if wallet.lamports() < user {
                    return Err(err(1106));
                }
                let next = received.checked_add(n).ok_or(err(1407))?;
                let distributed = read(&opening.try_borrow_data()?, 97)
                    .checked_add(n)
                    .ok_or(err(1407))?;
                for (account, amount) in [(curve, raw), (platform, p), (creator, c)] {
                    account.lamports().checked_add(amount).ok_or(err(1407))?;
                    if amount > 0 {
                        invoke(
                            &system_instruction::transfer(wallet.key, account.key, amount),
                            &[wallet.clone(), account.clone(), system.clone()],
                        )?;
                    }
                }
                if buyer_receipt.owner != program {
                    super::caps::allocate(
                        wallet,
                        buyer_receipt,
                        system,
                        program,
                        81,
                        &[b"buyer", mint.key.as_ref(), wallet.key.as_ref(), &[bump]],
                    )?;
                }
                let (_, custody_bump) =
                    Pubkey::find_program_address(&[SEED, mint.key.as_ref()], program);
                invoke_signed(
                    &spl_token::instruction::transfer_checked(
                        &spl_token::id(),
                        vault.key,
                        mint.key,
                        token_account.key,
                        custody.key,
                        &[],
                        n,
                        minted.decimals,
                    )?,
                    &[
                        vault.clone(),
                        mint.clone(),
                        token_account.clone(),
                        custody.clone(),
                        token_program.clone(),
                    ],
                    &[&[SEED, mint.key.as_ref(), &[custody_bump]]],
                )?;
                let mut receipt = buyer_receipt.try_borrow_mut_data()?;
                receipt[..8].copy_from_slice(b"JEETBUY1");
                receipt[8..40].copy_from_slice(mint.key.as_ref());
                receipt[40..72].copy_from_slice(wallet.key.as_ref());
                receipt[72..80].copy_from_slice(&next.to_le_bytes());
                receipt[80] = bump;
                opening.try_borrow_mut_data()?[97..105].copy_from_slice(&distributed.to_le_bytes());
                m.curve.sold = m.curve.sold.checked_add(n).ok_or(err(1407))?;
                m.curve.collected = m.curve.collected.checked_add(raw).ok_or(err(1407))?;
                m.raw_in = m.raw_in.checked_add(raw).ok_or(err(1407))?;
                if !m.completed && m.curve.sold == m.curve.inventory {
                    m.completed = true;
                    sol_log_data(&[
                        b"JEET_CURVE_COMPLETED_V1",
                        mint.key.as_ref(),
                        &next_sequence.to_le_bytes(),
                    ]);
                }
            }
            accrual(platform, p)?;
            accrual(creator, c)?;
            m.sequence = next_sequence;
            let mut d = curve.try_borrow_mut_data()?;
            for (at, value) in [
                (128, m.curve.sold),
                (136, m.curve.collected),
                (204, m.raw_in),
                (212, m.raw_out),
                (220, m.returned),
                (228, m.sequence),
            ] {
                d[at..at + 8].copy_from_slice(&value.to_le_bytes());
            }
            d[236] = u8::from(m.completed);
            drop(d);
            emit(mint.key, wallet.key, sell, n, (raw, p, c, user), &m);
            Ok(())
        }
        _ => Err(err(1400)),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn curve(sold: u64, scale: u64) -> super::super::curve::Curve {
        super::super::curve::Curve {
            fees: true,
            base: 1000,
            slope: 7,
            scale,
            sold,
            collected: 0,
            inventory: 1000000000,
            protection: None,
        }
    }
    #[test]
    fn rounding_and_carry() {
        let (mut p, mut c) = (0, 0);
        for _ in 0..400 {
            let (dp, dc) = fee_parts(1, p, c).unwrap();
            assert_eq!(dp + dc, 1);
            p += dp;
            c += dc;
        }
        assert_eq!((p, c), (300, 100));
        assert_eq!(fee_parts(10001, 0, 0).unwrap(), (76, 25));
        assert!(fee_parts(1, 0, 1).is_err());
    }
    #[test]
    fn inverse_never_refunds_more_than_buy() {
        for scale in [1, 10, 1000, 1000000000] {
            for sold in 0..50 {
                for n in 1..50 {
                    let before = curve(sold, scale);
                    let buy = super::super::curve::cost(&before, n).unwrap();
                    let after = curve(sold + n, scale);
                    assert!(redemption(&after, n).unwrap() <= buy);
                }
            }
        }
    }
    #[test]
    fn exact_and_invalid_redemption() {
        assert_eq!(redemption(&curve(10, 1), 10).unwrap(), 10315);
        assert!(redemption(&curve(0, 1), 1).is_err());
        assert!(redemption(&curve(10, 1), 0).is_err());
        assert!(redemption(&curve(10, 1), 11).is_err());
        assert!(fee_parts(u64::MAX, u64::MAX, 0).is_err());
        let platform = ((u128::from(u64::MAX) * 3 + 3) / 4) as u64;
        assert_eq!(
            fee_parts(1, platform, u64::MAX - platform).err(),
            Some(err(1407))
        );
        let mut huge = curve(u64::MAX, 1);
        huge.base = u64::MAX;
        huge.slope = u64::MAX;
        assert_eq!(redemption(&huge, u64::MAX).err(), Some(err(1407)));
    }
}
