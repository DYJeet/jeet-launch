//! Prospective opt-in graduation. Enabled only in disposable local-test builds.
use super::*;
use solana_program::{
    clock::Clock,
    instruction::{AccountMeta, Instruction},
    log::sol_log_data,
    program::{invoke, invoke_signed},
};
const MAGIC: &[u8] = b"JEETGRD1";
const LEN: usize = 253;
const AMM: Pubkey = solana_program::pubkey!("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb");
const WSOL: Pubkey = solana_program::pubkey!("So11111111111111111111111111111111111111112");
const FEE: Pubkey = solana_program::pubkey!("3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy");
fn e(n: u32) -> ProgramError {
    ProgramError::Custom(n)
}
fn read(d: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(d[at..at + 8].try_into().unwrap())
}
fn pda(program: &Pubkey, seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, program).0
}
fn gap(raw: u64, quantum: u64, end: u64, tokens: u64, bps: u16) -> ProgramResult {
    let n = u128::from(raw)
        .checked_mul(u128::from(quantum))
        .ok_or(e(1607))?;
    let d = u128::from(end)
        .checked_mul(u128::from(tokens))
        .filter(|x| *x > 0)
        .ok_or(e(1607))?;
    if n.abs_diff(d).checked_mul(10000).ok_or(e(1607))?
        > d.checked_mul(u128::from(bps)).ok_or(e(1607))?
    {
        return Err(e(1605));
    }
    Ok(())
}
fn sqrt(n: u128) -> Result<u64, ProgramError> {
    if n < 2 {
        return Ok(n as u64);
    }
    let mut x = n;
    let mut y = n.checked_add(1).ok_or(e(1607))? / 2;
    while y < x {
        x = y;
        y = x.checked_add(n / x).ok_or(e(1607))? / 2;
    }
    u64::try_from(x).map_err(|_| e(1607))
}
fn check_terms(program: &Pubkey, mint: &Pubkey, curve: &Pubkey, a: &AccountInfo) -> ProgramResult {
    let (key, bump) = Pubkey::find_program_address(&[b"graduation", mint.as_ref()], program);
    let d = a.try_borrow_data()?;
    if a.key != &key
        || a.owner != program
        || a.executable
        || d.len() != LEN
        || &d[..8] != MAGIC
        || &d[8..40] != mint.as_ref()
        || &d[40..72] != curve.as_ref()
        || &d[72..104] != AMM.as_ref()
        || d[250] != bump
    {
        return Err(e(1601));
    }
    if d[252] != 0 {
        return Err(e(1609));
    }
    Ok(())
}
fn ata_create<'a>(
    payer: &AccountInfo<'a>,
    dst: &AccountInfo<'a>,
    owner: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    sys: &AccountInfo<'a>,
    tok: &AccountInfo<'a>,
    associated: &AccountInfo<'a>,
) -> ProgramResult {
    invoke(
        &Instruction {
            program_id: ATA_PROGRAM,
            data: vec![1],
            accounts: vec![
                AccountMeta::new(*payer.key, true),
                AccountMeta::new(*dst.key, false),
                AccountMeta::new_readonly(*owner.key, false),
                AccountMeta::new_readonly(*mint.key, false),
                AccountMeta::new_readonly(*sys.key, false),
                AccountMeta::new_readonly(*tok.key, false),
            ],
        },
        &[
            payer.clone(),
            dst.clone(),
            owner.clone(),
            mint.clone(),
            sys.clone(),
            tok.clone(),
            associated.clone(),
        ],
    )
}
pub fn process(program: &Pubkey, a: &[AccountInfo], input: &[u8]) -> ProgramResult {
    match input.first() {
        Some(21) => {
            if input.len() != 3 || a.len() != 9 {
                return Err(e(1600));
            }
            let caller = &a[0];
            if !caller.is_signer {
                return Err(e(1602));
            }
            if !caller.is_writable
                || caller.owner != &system_program::id()
                || !caller.data_is_empty()
            {
                return Err(e(1601));
            }
            let m = super::v5::load(program, &a[1], &a[2], &a[3], &a[4], &a[5], &a[6])?;
            if caller.key != &super::fees::creator(&a[2])? {
                return Err(e(1602));
            }
            if m.sequence != 0
                || m.curve.sold != 0
                || m.raw_in != 0
                || m.raw_out != 0
                || m.returned != 0
            {
                return Err(e(1604));
            }
            let bps = u16::from_le_bytes(input[1..3].try_into().unwrap());
            if bps > 100 {
                return Err(e(1605));
            }
            let reserve = super::v5::price(&m).potential(m.curve.inventory)?;
            let reserved = read(&a[4].try_borrow_data()?, 253);
            gap(reserve, m.quantum, m.curve.slope, reserved, bps)?;
            sqrt(
                u128::from(reserve)
                    .checked_mul(u128::from(reserved))
                    .ok_or(e(1607))?,
            )?
            .checked_sub(100)
            .filter(|x| *x > 0)
            .ok_or(e(1605))?;
            let (key, bump) =
                Pubkey::find_program_address(&[b"graduation", a[1].key.as_ref()], program);
            if a[7].key != &key || a[8].key != &system_program::id() || !a[8].executable {
                return Err(e(1601));
            }
            super::caps::allocate(
                caller,
                &a[7],
                &a[8],
                program,
                LEN,
                &[b"graduation", a[1].key.as_ref(), &[bump]],
            )?;
            let (migrator, mbump) =
                Pubkey::find_program_address(&[b"migrator", a[1].key.as_ref()], program);
            let config = pda(&AMM, &[b"amm_config", &[0, 0]]);
            let mut d = a[7].try_borrow_mut_data()?;
            d.fill(0);
            d[..8].copy_from_slice(MAGIC);
            for (at, k) in [
                (8, a[1].key),
                (40, a[4].key),
                (72, &AMM),
                (104, &config),
                (136, &migrator),
            ] {
                d[at..at + 32].copy_from_slice(k.as_ref());
            }
            d[224..226].copy_from_slice(&bps.to_le_bytes());
            d[226..234].copy_from_slice(&Clock::get()?.slot.to_le_bytes());
            d[250] = bump;
            d[251] = mbump;
            sol_log_data(&[b"JEET_GRAD_TERMS_V1", a[1].key.as_ref(), &bps.to_le_bytes()]);
            Ok(())
        }
        Some(22) => {
            if input.len() != 25 || a.len() != 26 {
                return Err(e(1600));
            }
            let caller = &a[0];
            if !caller.is_signer {
                return Err(e(1602));
            }
            if caller.owner != &system_program::id()
                || !caller.data_is_empty()
                || !caller.is_writable
            {
                return Err(e(1601));
            }
            check_terms(program, a[1].key, a[4].key, &a[7])?;
            let m = super::v5::load(program, &a[1], &a[2], &a[3], &a[4], &a[5], &a[6])?;
            if m.sequence != read(input, 1) {
                return Err(e(1604));
            }
            if !m.completed || m.curve.sold != m.curve.inventory || m.curve.collected == 0 {
                return Err(e(1603));
            }
            let phase = m.curve.protection.ok_or(e(1601))?;
            let slot = Clock::get()?.slot;
            let opening = a[3].try_borrow_data()?;
            if slot < phase.end || (opening[96] == 1 && slot < read(&opening, 88)) {
                return Err(e(1610));
            }
            drop(opening);
            let mint = &a[1];
            let curve = &a[4];
            let migrator = &a[8];
            let config = &a[9];
            let pool = &a[11];
            let (migrator_key, mbump) =
                Pubkey::find_program_address(&[b"migrator", mint.key.as_ref()], program);
            let nonce = read(input, 17).to_le_bytes();
            let (pool_key, pbump) =
                Pubkey::find_program_address(&[b"amm_pool", mint.key.as_ref(), &nonce], program);
            let mint_first = mint.key.to_bytes() < WSOL.to_bytes();
            let mint0 = if mint_first { mint.key } else { &WSOL };
            let mint1 = if mint_first { &WSOL } else { mint.key };
            let cfg_key = pda(&AMM, &[b"amm_config", &[0, 0]]);
            if migrator.key != &migrator_key
                || migrator.owner != &system_program::id()
                || !migrator.data_is_empty()
                || config.key != &cfg_key
                || config.owner != &AMM
                || a[10].key != &pda(&AMM, &[b"vault_and_lp_mint_auth_seed"])
                || pool.key != &pool_key
                || pool.owner != &system_program::id()
                || !pool.data_is_empty()
                || a[12].key != &WSOL
                || a[12].owner != &spl_token::id()
                || a[13].key != &pda(&AMM, &[b"pool_lp_mint", pool.key.as_ref()])
                || a[14].key != &ata(migrator.key, mint.key)
                || a[15].key != &ata(migrator.key, &WSOL)
                || a[16].key != &ata(migrator.key, a[13].key)
                || a[17].key != &pda(&AMM, &[b"pool_vault", pool.key.as_ref(), mint0.as_ref()])
                || a[18].key != &pda(&AMM, &[b"pool_vault", pool.key.as_ref(), mint1.as_ref()])
                || a[19].key != &FEE
                || a[20].key != &pda(&AMM, &[b"observation", pool.key.as_ref()])
                || a[21].key != &spl_token::id()
                || !a[21].executable
                || a[22].key != &ATA_PROGRAM
                || !a[22].executable
                || a[23].key != &system_program::id()
                || !a[23].executable
                || a[24].key != &solana_program::sysvar::rent::id()
                || a[25].key != &AMM
                || !a[25].executable
            {
                return Err(e(1601));
            }
            for i in [4usize, 6, 7, 8, 11, 13, 14, 15, 16, 17, 18, 19, 20] {
                if !a[i].is_writable {
                    return Err(e(1601));
                }
            }
            let cfg = config.try_borrow_data()?;
            if cfg.len() != 236 || cfg[9] != 0 || read(&cfg, 12) != 2500 {
                return Err(e(1601));
            }
            drop(cfg);
            let td = a[7].try_borrow_data()?;
            if &td[104..136] != cfg_key.as_ref()
                || &td[136..168] != migrator_key.as_ref()
                || td[251] != mbump
            {
                return Err(e(1601));
            }
            let bps = u16::from_le_bytes(td[224..226].try_into().unwrap());
            if bps > 100 {
                return Err(e(1605));
            }
            drop(td);
            let raw = m.curve.collected;
            let amount = read(&curve.try_borrow_data()?, 253);
            gap(raw, m.quantum, m.curve.slope, amount, bps)?;
            let liquidity = sqrt(
                u128::from(raw)
                    .checked_mul(u128::from(amount))
                    .ok_or(e(1607))?,
            )?;
            let burn = liquidity
                .checked_sub(100)
                .filter(|x| *x > 0)
                .ok_or(e(1605))?;
            let wallet_before = caller.lamports();
            let pocket_before = migrator.lamports();
            let budget = read(input, 9);
            let fresh_token = a[14].lamports() == 0;
            let fresh_wsol = a[15].lamports() == 0;
            let fresh_lp = a[16].lamports() == 0;
            ata_create(caller, &a[14], migrator, mint, &a[23], &a[21], &a[22])?;
            ata_create(caller, &a[15], migrator, &a[12], &a[23], &a[21], &a[22])?;
            let token_before = vault_check(&a[14], migrator.key, mint.key)?.amount;
            invoke(
                &spl_token::instruction::sync_native(&spl_token::id(), a[15].key)?,
                &[a[15].clone(), a[21].clone()],
            )?;
            let wt = token(&a[15])?;
            if wt.owner != *migrator.key
                || wt.mint != WSOL
                || wt.state != AccountState::Initialized
                || wt.delegate != COption::None
                || wt.close_authority != COption::None
                || wt.is_native == COption::None
            {
                return Err(e(1601));
            }
            let wsol_before = wt.amount;
            let spent = wallet_before
                .checked_sub(caller.lamports())
                .ok_or(e(1607))?;
            let fund = budget
                .checked_sub(spent)
                .filter(|x| *x > 0)
                .ok_or(e(1606))?;
            invoke(
                &system_instruction::transfer(caller.key, migrator.key, fund),
                &[caller.clone(), migrator.clone(), a[23].clone()],
            )?;
            **curve.try_borrow_mut_lamports()? =
                curve.lamports().checked_sub(raw).ok_or(e(1607))?;
            **a[15].try_borrow_mut_lamports()? =
                a[15].lamports().checked_add(raw).ok_or(e(1607))?;
            // Synchronize both sides of the direct lamport movement into the CPI runtime.
            let mut sync = spl_token::instruction::sync_native(&spl_token::id(), a[15].key)?;
            sync.accounts.push(AccountMeta::new(*curve.key, false));
            invoke(&sync, &[a[15].clone(), curve.clone(), a[21].clone()])?;
            let (_, cbump) = Pubkey::find_program_address(&[b"curve", mint.key.as_ref()], program);
            let cseeds: &[&[u8]] = &[b"curve", mint.key.as_ref(), &[cbump]];
            let mseeds: &[&[u8]] = &[b"migrator", mint.key.as_ref(), &[mbump]];
            let pseeds: &[&[u8]] = &[b"amm_pool", mint.key.as_ref(), &nonce, &[pbump]];
            let decimals = Mint::unpack(&mint.try_borrow_data()?)?.decimals;
            invoke_signed(
                &spl_token::instruction::transfer_checked(
                    &spl_token::id(),
                    a[6].key,
                    mint.key,
                    a[14].key,
                    curve.key,
                    &[],
                    amount,
                    decimals,
                )?,
                &[
                    a[6].clone(),
                    mint.clone(),
                    a[14].clone(),
                    curve.clone(),
                    a[21].clone(),
                ],
                &[cseeds],
            )?;
            let indexes = if mint_first {
                [
                    8, 9, 10, 11, 1, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 21, 21, 22, 23, 24,
                ]
            } else {
                [
                    8, 9, 10, 11, 12, 1, 13, 15, 14, 16, 17, 18, 19, 20, 21, 21, 21, 22, 23, 24,
                ]
            };
            let mut metas = Vec::new();
            let mut infos = Vec::new();
            for (j, i) in indexes.iter().enumerate() {
                let signer = j == 0 || j == 3;
                metas.push(if matches!(j, 0 | 3 | 6..=13) {
                    AccountMeta::new(*a[*i].key, signer)
                } else {
                    AccountMeta::new_readonly(*a[*i].key, signer)
                });
                infos.push(a[*i].clone());
            }
            infos.push(a[25].clone());
            let mut data = vec![175, 175, 109, 31, 13, 152, 155, 237];
            for n in [
                if mint_first { amount } else { raw },
                if mint_first { raw } else { amount },
                0,
            ] {
                data.extend_from_slice(&n.to_le_bytes());
            }
            invoke_signed(
                &Instruction {
                    program_id: AMM,
                    accounts: metas,
                    data,
                },
                &infos,
                &[mseeds, pseeds],
            )?;
            let pd = pool.try_borrow_data()?;
            if pool.owner != &AMM
                || pd.len() != 637
                || &pd[8..40] != config.key.as_ref()
                || &pd[40..72] != migrator.key.as_ref()
                || &pd[72..104] != a[17].key.as_ref()
                || &pd[104..136] != a[18].key.as_ref()
                || &pd[136..168] != a[13].key.as_ref()
                || &pd[168..200] != mint0.as_ref()
                || &pd[200..232] != mint1.as_ref()
                || read(&pd, 333) != liquidity
                || pd[390] != 0
            {
                return Err(e(1608));
            }
            drop(pd);
            for (i, n, k) in [
                (17, if mint_first { amount } else { raw }, mint0),
                (18, if mint_first { raw } else { amount }, mint1),
            ] {
                let t = token(&a[i])?;
                if t.owner != *a[10].key
                    || t.mint != *k
                    || t.amount != n
                    || t.delegate != COption::None
                    || t.close_authority != COption::None
                    || t.state != AccountState::Initialized
                {
                    return Err(e(1608));
                }
            }
            let lp = Mint::unpack(&a[13].try_borrow_data()?)?;
            let lpt = token(&a[16])?;
            if lp.supply != burn
                || lp.decimals != 9
                || lp.mint_authority != COption::Some(*a[10].key)
                || lp.freeze_authority != COption::None
                || lpt.owner != *migrator.key
                || lpt.mint != *a[13].key
                || lpt.amount != burn
            {
                return Err(e(1608));
            }
            invoke_signed(
                &spl_token::instruction::burn_checked(
                    &spl_token::id(),
                    a[16].key,
                    a[13].key,
                    migrator.key,
                    &[],
                    burn,
                    9,
                )?,
                &[
                    a[16].clone(),
                    a[13].clone(),
                    migrator.clone(),
                    a[21].clone(),
                ],
                &[mseeds],
            )?;
            if Mint::unpack(&a[13].try_borrow_data()?)?.supply != 0
                || token(&a[16])?.amount != 0
                || token(&a[14])?.amount != token_before
                || token(&a[15])?.amount != wsol_before
            {
                return Err(e(1608));
            }
            let refund = migrator
                .lamports()
                .checked_sub(pocket_before)
                .ok_or(e(1606))?;
            if refund > 0 {
                invoke_signed(
                    &system_instruction::transfer(migrator.key, caller.key, refund),
                    &[migrator.clone(), caller.clone(), a[23].clone()],
                    &[mseeds],
                )?;
            }
            for (i, close) in [
                (14, fresh_token && token_before == 0),
                (15, fresh_wsol && wsol_before == 0),
                (16, fresh_lp),
            ] {
                if close {
                    invoke_signed(
                        &spl_token::instruction::close_account(
                            &spl_token::id(),
                            a[i].key,
                            caller.key,
                            migrator.key,
                            &[],
                        )?,
                        &[
                            a[i].clone(),
                            caller.clone(),
                            migrator.clone(),
                            a[21].clone(),
                        ],
                        &[mseeds],
                    )?;
                }
            }
            if wallet_before
                .checked_sub(caller.lamports())
                .ok_or(e(1607))?
                > budget
                || migrator.lamports() != pocket_before
            {
                return Err(e(1606));
            }
            let sequence = m.sequence.checked_add(1).ok_or(e(1607))?;
            let slot = Clock::get()?.slot;
            let mut cd = curve.try_borrow_mut_data()?;
            cd[136..144].copy_from_slice(&0u64.to_le_bytes());
            cd[228..236].copy_from_slice(&sequence.to_le_bytes());
            cd[261] = 2;
            drop(cd);
            let mut td = a[7].try_borrow_mut_data()?;
            td[168..200].copy_from_slice(pool.key.as_ref());
            for (at, n) in [
                (200, raw),
                (208, amount),
                (216, burn),
                (234, slot),
                (242, sequence),
            ] {
                td[at..at + 8].copy_from_slice(&n.to_le_bytes());
            }
            td[252] = 1;
            sol_log_data(&[
                b"JEET_GRADUATED_V1",
                mint.key.as_ref(),
                pool.key.as_ref(),
                &raw.to_le_bytes(),
                &amount.to_le_bytes(),
                &burn.to_le_bytes(),
                &nonce,
            ]);
            Ok(())
        }
        _ => Err(e(1600)),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checked_sqrt() {
        for n in 0..10000u128 {
            let s = u128::from(sqrt(n).unwrap());
            assert!(s * s <= n);
            assert!((s + 1) * (s + 1) > n);
        }
        assert_eq!(
            sqrt(u128::from(u64::MAX) * u128::from(u64::MAX)).unwrap(),
            u64::MAX
        );
    }
    #[test]
    fn ratio_boundary() {
        assert!(gap(50192999999, 1000000000, 126, 396000000000000000, 60).is_ok());
        assert!(gap(50192999999, 1000000000, 126, 396000000000000000, 59).is_err());
        assert!(gap(1, 1, 0, 1, 60).is_err());
    }
}
