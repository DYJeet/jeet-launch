//! Local-validator V5 execution preview. NEVER enabled in the production artifact.
//! Completion is eligibility only; sells stay backed, and no migration/withdrawal exists.
//! Kept version-isolated from V4 until economic and integration approval.
use super::*;
use solana_program::{
    clock::Clock,
    log::sol_log_data,
    program::{invoke, set_return_data},
};
pub const MAGIC: &[u8] = b"JEETCRV5";
pub const LEN: usize = 262;
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
    pub quantum: u64,
}
use super::market::fee_parts;
fn price(m: &Market) -> super::v5_math::Pricing {
    super::v5_math::Pricing {
        inventory: m.curve.inventory,
        quantum: m.quantum,
        start: m.curve.base,
        end: m.curve.slope,
    }
}
fn protection(
    d: &[u8],
    supply: u64,
    inventory: u64,
    open: &[u8],
) -> Result<super::protected::Protection, ProgramError> {
    let mut legacy = [0u8; 204];
    legacy.copy_from_slice(&d[..204]);
    legacy[..8].copy_from_slice(super::market::MAGIC);
    super::protected::decode(&legacy, supply, inventory, open)
}
fn load(
    program: &Pubkey,
    mint: &AccountInfo,
    custody: &AccountInfo,
    opening: &AccountInfo,
    curve: &AccountInfo,
    vault: &AccountInfo,
    migration: &AccountInfo,
) -> Result<Market, ProgramError> {
    let (creator, inventory) =
        super::caps::custody(custody, mint, program).map_err(|_| err(1501))?;
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
        || minted.mint_authority != COption::None
        || minted.freeze_authority != COption::None
        || creator.checked_add(inventory) != Some(minted.supply)
    {
        return Err(err(1501));
    }
    let c = super::curve::Curve {
        fees: true,
        base: read(&d, 104),
        slope: read(&d, 112),
        scale: read(&d, 120),
        sold: read(&d, 128),
        collected: read(&d, 136),
        inventory: read(&d, 144),
        protection: Some(protection(&d, minted.supply, inventory, &o)?),
    };
    let m = Market {
        curve: c,
        raw_in: read(&d, 204),
        raw_out: read(&d, 212),
        returned: read(&d, 220),
        sequence: read(&d, 228),
        completed: d[236] == 1,
        quantum: read(&d, 245),
    };
    if c.base == 0
        || c.scale != 10u64.pow(u32::from(minted.decimals))
        || c.inventory.checked_add(read(&d, 253)) != Some(inventory)
        || read(&d, 253) == 0
        || d[261] != u8::from(c.sold == c.inventory)
        || m.quantum < c.scale
        || m.quantum % c.scale != 0
        || read(&d, 253) % m.quantum != 0
        || price(&m).potential(c.sold)? != c.collected
        || c.sold > inventory
        || c.sold.checked_add(m.returned) != Some(read(&o, 97))
        || m.raw_in.checked_sub(m.raw_out) != Some(c.collected)
        || d[236] > 1
        || read(&d, 237) != c.inventory
        || m.completed != (c.sold == c.inventory)
        || (m.sequence == 0 && (m.raw_in != 0 || m.returned != 0 || read(&o, 97) != 0))
    {
        return Err(err(1510));
    }
    if vault_check(vault, custody.key, mint.key)
        .map_err(|_| err(1501))?
        .amount
        < c.inventory.checked_sub(c.sold).ok_or(err(1507))?
    {
        return Err(err(1510));
    }
    if vault_check(migration, curve.key, mint.key)
        .map_err(|_| err(1501))?
        .amount
        < read(&d, 253)
    {
        return Err(err(1510));
    }
    if curve.lamports()
        < Rent::get()?
            .minimum_balance(LEN)
            .checked_add(c.collected)
            .ok_or(err(1507))?
    {
        return Err(err(1506));
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
    let (pa, _) = super::fees::load(program, mint.key, curve.key, p, 0, &super::fees::TREASURY)
        .map_err(|_| err(1501))?;
    let (ca, _) = super::fees::load(
        program,
        mint.key,
        curve.key,
        c,
        1,
        &super::fees::creator(custody)?,
    )
    .map_err(|_| err(1501))?;
    Ok((pa, ca))
}
fn accrual(account: &AccountInfo, amount: u64) -> ProgramResult {
    let mut d = account.try_borrow_mut_data()?;
    let next = read(&d, 105).checked_add(amount).ok_or(err(1507))?;
    let liability = next.checked_sub(read(&d, 113)).ok_or(err(1507))?;
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
        return Err(err(1501));
    }
    if account.owner == program {
        let d = account.try_borrow_data()?;
        if d.len() != 81
            || &d[..8] != b"JEETBUY1"
            || &d[8..40] != mint.as_ref()
            || &d[40..72] != wallet.as_ref()
            || d[80] != bump
        {
            return Err(err(1501));
        }
        Ok((read(&d, 72), bump))
    } else if account.owner == &system_program::id() && account.data_is_empty() {
        Ok((0, bump))
    } else {
        Err(err(1501))
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
        b"JEET_V5_PREVIEW_TRADE",
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
        Some(16) => {
            if input.len() != 59 || a.len() != 12 {
                return Err(err(1500));
            }
            if a[11].key != &spl_token::id() || !a[11].executable || !a[10].is_writable {
                return Err(err(1501));
            }
            let minted = Mint::unpack(&a[1].try_borrow_data()?)?;
            let (creator, total) = super::caps::custody(&a[2], &a[1], program)?;
            let quantum = read(input, 35);
            let trading = read(input, 43);
            let reserved = read(input, 51);
            let scale = 10u64
                .checked_pow(u32::from(minted.decimals))
                .ok_or(err(1507))?;
            let pricing = super::v5_math::Pricing {
                inventory: trading,
                quantum,
                start: read(input, 1),
                end: read(input, 9),
            };
            if minted.decimals > 9
                || quantum < scale
                || quantum % scale != 0
                || reserved == 0
                || reserved % quantum != 0
                || trading.checked_add(reserved) != Some(total)
                || u128::from(creator) * 10000 > u128::from(minted.supply) * 500
                || vault_check(&a[10], a[4].key, a[1].key)
                    .map_err(|_| err(1501))?
                    .amount
                    != 0
            {
                return Err(err(1503));
            }
            pricing.potential(trading)?;
            let mut base = input[..35].to_vec();
            base[0] = 11;
            super::market::process(program, &a[..10], &base)?;
            let payer = &a[0];
            let curve = &a[4];
            let system = &a[6];
            let rent = Rent::get()?.minimum_balance(LEN);
            if curve.lamports() < rent {
                invoke(
                    &system_instruction::transfer(payer.key, curve.key, rent - curve.lamports()),
                    &[payer.clone(), curve.clone(), system.clone()],
                )?;
            }
            curve.resize(LEN)?;
            let (_, bump) = Pubkey::find_program_address(&[SEED, a[1].key.as_ref()], program);
            invoke_signed(
                &spl_token::instruction::transfer_checked(
                    &spl_token::id(),
                    a[5].key,
                    a[1].key,
                    a[10].key,
                    a[2].key,
                    &[],
                    reserved,
                    minted.decimals,
                )?,
                &[
                    a[5].clone(),
                    a[1].clone(),
                    a[10].clone(),
                    a[2].clone(),
                    a[11].clone(),
                ],
                &[&[SEED, a[1].key.as_ref(), &[bump]]],
            )?;
            let mut d = curve.try_borrow_mut_data()?;
            d[..8].copy_from_slice(MAGIC);
            for (at, value) in [
                (144, trading),
                (237, trading),
                (245, quantum),
                (253, reserved),
            ] {
                d[at..at + 8].copy_from_slice(&value.to_le_bytes());
            }
            d[261] = 0;
            sol_log_data(&[
                b"JEET_V5_PREVIEW_INIT",
                a[1].key.as_ref(),
                &trading.to_le_bytes(),
                &reserved.to_le_bytes(),
                &quantum.to_le_bytes(),
            ]);
            Ok(())
        }
        Some(17 | 18) => {
            if input.len() != 9 || a.len() != 8 {
                return Err(err(1500));
            }
            let m = load(program, &a[0], &a[1], &a[2], &a[3], &a[4], &a[7])?;
            let n = read(input, 1);
            let sell = input[0] == 18;
            if n == 0
                || (!sell
                    && n > m
                        .curve
                        .inventory
                        .checked_sub(m.curve.sold)
                        .ok_or(err(1507))?)
            {
                return Err(err(1503));
            }
            let raw = if sell {
                price(&m).raw(m.curve.sold, n, true)?
            } else {
                price(&m).raw(m.curve.sold, n, false)?
            };
            let (pa, ca) = fee_state(program, &a[0], &a[1], &a[3], &a[5], &a[6])?;
            let (p, c) = fee_parts(raw, pa, ca)?;
            let fees = p.checked_add(c).ok_or(err(1507))?;
            let user = if sell {
                raw.checked_sub(fees).filter(|v| *v > 0).ok_or(err(1509))?
            } else {
                raw.checked_add(fees).ok_or(err(1507))?
            };
            if sell && raw > m.curve.collected {
                return Err(err(1506));
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
        Some(19 | 20) => {
            if input.len() != 41 || a.len() != 13 {
                return Err(err(1500));
            }
            let sell = input[0] == 20;
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
                return Err(err(1502));
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
                return Err(err(1501));
            }
            let mut m = load(program, mint, custody, opening, curve, vault, &a[12])?;
            let t = token(token_account).map_err(|_| err(1501))?;
            if token_account.key == vault.key
                || t.mint != *mint.key
                || t.owner != *wallet.key
                || t.state != AccountState::Initialized
            {
                return Err(err(1501));
            }
            let (received, bump) = receipt(program, mint.key, wallet.key, buyer_receipt)?;
            let n = read(input, 1);
            if n == 0 {
                return Err(err(1503));
            }
            if read(input, 9) != m.curve.sold || read(input, 33) != m.sequence {
                return Err(err(1504));
            }
            let phase = m.curve.protection.ok_or(err(1510))?;
            let slot = Clock::get()?.slot;
            if slot < phase.start {
                return Err(err(1200));
            }
            let raw = if sell {
                if t.amount < n {
                    return Err(err(1513));
                }
                price(&m).raw(m.curve.sold, n, true)?
            } else {
                let next = received.checked_add(n).ok_or(err(1507))?;
                let open = opening.try_borrow_data()?;
                if open[96] == 1 && slot < read(&open, 88) && next > read(&open, 72) {
                    return Err(err(1005));
                }
                phase.enforce(slot, next)?;
                if n > m
                    .curve
                    .inventory
                    .checked_sub(m.curve.sold)
                    .ok_or(err(1507))?
                {
                    return Err(err(1503));
                }
                price(&m).raw(m.curve.sold, n, false)?
            };
            if raw != read(input, 17) {
                return Err(err(1508));
            }
            let (pa, ca) = fee_state(program, mint, custody, curve, platform, creator)?;
            let (p, c) = fee_parts(raw, pa, ca)?;
            let fee = p.checked_add(c).ok_or(err(1507))?;
            let user = if sell {
                raw.checked_sub(fee).filter(|v| *v > 0).ok_or(err(1509))?
            } else {
                raw.checked_add(fee).ok_or(err(1507))?
            };
            if (sell && user < read(input, 25)) || (!sell && user > read(input, 25)) {
                return Err(err(1508));
            }
            let next_sequence = m.sequence.checked_add(1).ok_or(err(1507))?;
            let minted = Mint::unpack(&mint.try_borrow_data()?)?;
            if sell {
                if raw > m.curve.collected {
                    return Err(err(1506));
                }
                let next_reserve = m.curve.collected.checked_sub(raw).ok_or(err(1507))?;
                let next_balance = curve.lamports().checked_sub(raw).ok_or(err(1507))?;
                if next_balance
                    < Rent::get()?
                        .minimum_balance(LEN)
                        .checked_add(next_reserve)
                        .ok_or(err(1507))?
                {
                    return Err(err(1506));
                }
                let wallet_balance = wallet.lamports().checked_add(user).ok_or(err(1507))?;
                let pb = platform.lamports().checked_add(p).ok_or(err(1507))?;
                let cb = creator.lamports().checked_add(c).ok_or(err(1507))?;
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
                m.curve.sold = m.curve.sold.checked_sub(n).ok_or(err(1507))?;
                m.curve.collected = next_reserve;
                m.raw_out = m.raw_out.checked_add(raw).ok_or(err(1507))?;
                m.returned = m.returned.checked_add(n).ok_or(err(1507))?;
            } else {
                if wallet.lamports() < user {
                    return Err(err(1106));
                }
                let next = received.checked_add(n).ok_or(err(1507))?;
                let distributed = read(&opening.try_borrow_data()?, 97)
                    .checked_add(n)
                    .ok_or(err(1507))?;
                for (account, amount) in [(curve, raw), (platform, p), (creator, c)] {
                    account.lamports().checked_add(amount).ok_or(err(1507))?;
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
                m.curve.sold = m.curve.sold.checked_add(n).ok_or(err(1507))?;
                m.curve.collected = m.curve.collected.checked_add(raw).ok_or(err(1507))?;
                m.raw_in = m.raw_in.checked_add(raw).ok_or(err(1507))?;
                if !m.completed && m.curve.sold == m.curve.inventory {
                    m.completed = true;
                    sol_log_data(&[
                        b"JEET_V5_ELIGIBLE",
                        mint.key.as_ref(),
                        &next_sequence.to_le_bytes(),
                    ]);
                }
            }
            m.completed = m.curve.sold == m.curve.inventory;
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
            d[261] = u8::from(m.completed);
            drop(d);
            emit(mint.key, wallet.key, sell, n, (raw, p, c, user), &m);
            Ok(())
        }
        _ => Err(err(1500)),
    }
}
