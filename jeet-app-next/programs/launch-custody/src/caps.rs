//! Immutable opening configuration and cumulative per-wallet launch receipts.
use super::*;
use solana_program::clock::Clock;
const OPEN_LEN: usize = 108;
const RECEIPT_LEN: usize = 81;
const OPEN_MAGIC: &[u8] = b"JEETOPN1";
const BUY_MAGIC: &[u8] = b"JEETBUY1";

#[repr(u32)]
#[derive(Clone, Copy)]
enum Error {
    Encoding = 1000,
    Accounts,
    Signature,
    Identity,
    Configuration,
    CapExceeded,
    Amount,
    Inventory,
    Arithmetic,
    AlreadyInitialized,
}
fn fail(e: Error) -> ProgramError {
    ProgramError::Custom(e as u32)
}
fn u64_at(bytes: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap())
}
fn custody(
    state: &AccountInfo,
    mint: &AccountInfo,
    program: &Pubkey,
) -> Result<(u64, u64), ProgramError> {
    let (key, bump) = Pubkey::find_program_address(&[SEED, mint.key.as_ref()], program);
    let data = state.try_borrow_data()?;
    if state.key != &key
        || state.owner != program
        || data.len() != STATE_LEN
        || &data[..8] != MAGIC
        || &data[8..40] != mint.key.as_ref()
        || data[88] != bump
        || mint.owner != &spl_token::id()
    {
        return Err(fail(Error::Identity));
    }
    Ok((u64_at(&data, 72), u64_at(&data, 80)))
}
fn allocate<'a>(
    payer: &AccountInfo<'a>,
    account: &AccountInfo<'a>,
    system: &AccountInfo<'a>,
    program: &Pubkey,
    length: usize,
    seeds: &[&[u8]],
) -> ProgramResult {
    if account.owner != &system_program::id() || !account.data_is_empty() {
        return Err(fail(Error::AlreadyInitialized));
    }
    let rent = Rent::get()?.minimum_balance(length);
    if account.lamports() < rent {
        solana_program::program::invoke(
            &system_instruction::transfer(payer.key, account.key, rent - account.lamports()),
            &[payer.clone(), account.clone(), system.clone()],
        )?;
    }
    invoke_signed(
        &system_instruction::allocate(account.key, length as u64),
        &[account.clone(), system.clone()],
        &[seeds],
    )?;
    invoke_signed(
        &system_instruction::assign(account.key, program),
        &[account.clone(), system.clone()],
        &[seeds],
    )
}
fn system_check(system: &AccountInfo) -> ProgramResult {
    if system.key != &system_program::id() || !system.executable {
        return Err(fail(Error::Identity));
    }
    Ok(())
}
pub fn process(program: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
    match input.first() {
        Some(2) => {
            if input.len() != 12 {
                return Err(fail(Error::Encoding));
            }
            if accounts.len() != 5 {
                return Err(fail(Error::Accounts));
            }
            let payer = &accounts[0];
            let mint = &accounts[1];
            let state = &accounts[2];
            let opening = &accounts[3];
            let system = &accounts[4];
            if !payer.is_signer {
                return Err(fail(Error::Signature));
            }
            if !payer.is_writable || !opening.is_writable {
                return Err(fail(Error::Accounts));
            }
            system_check(system)?;
            let (creator, inventory) = custody(state, mint, program)?;
            let minted = Mint::unpack(&mint.try_borrow_data()?)?;
            if minted.mint_authority != COption::Some(*payer.key) {
                return Err(fail(Error::Signature));
            }
            if creator.checked_add(inventory) != Some(minted.supply) {
                return Err(fail(Error::Configuration));
            }
            let bps = u16::from_le_bytes(input[1..3].try_into().unwrap());
            let enabled = input[3];
            let duration = u64_at(input, 4);
            if bps > 10000 || enabled > 1 || duration > 1_000_000 || (enabled == 1 && duration == 0)
            {
                return Err(fail(Error::Configuration));
            }
            let (key, bump) =
                Pubkey::find_program_address(&[b"opening", mint.key.as_ref()], program);
            if opening.key != &key {
                return Err(fail(Error::Identity));
            }
            let start = Clock::get()?.slot;
            let end = start.checked_add(duration).ok_or(fail(Error::Arithmetic))?;
            let cap = (u128::from(minted.supply) * u128::from(bps) / 10000) as u64;
            allocate(
                payer,
                opening,
                system,
                program,
                OPEN_LEN,
                &[b"opening", mint.key.as_ref(), &[bump]],
            )?;
            let mut data = opening.try_borrow_mut_data()?;
            data[..8].copy_from_slice(OPEN_MAGIC);
            data[8..40].copy_from_slice(mint.key.as_ref());
            data[40..72].copy_from_slice(state.key.as_ref());
            data[72..80].copy_from_slice(&cap.to_le_bytes());
            data[80..88].copy_from_slice(&start.to_le_bytes());
            data[88..96].copy_from_slice(&end.to_le_bytes());
            data[96] = enabled;
            data[97..105].copy_from_slice(&0u64.to_le_bytes());
            data[105] = bump;
            data[106..108].copy_from_slice(&bps.to_le_bytes());
            Ok(())
        }
        Some(3) => {
            if input.len() != 9 {
                return Err(fail(Error::Encoding));
            }
            if accounts.len() != 9 {
                return Err(fail(Error::Accounts));
            }
            let buyer = &accounts[0];
            let mint = &accounts[1];
            let state = &accounts[2];
            let vault = &accounts[3];
            let destination = &accounts[4];
            let opening = &accounts[5];
            let receipt = &accounts[6];
            let system = &accounts[7];
            let token_program = &accounts[8];
            if !buyer.is_signer {
                return Err(fail(Error::Signature));
            }
            if !buyer.is_writable
                || !vault.is_writable
                || !destination.is_writable
                || !opening.is_writable
                || !receipt.is_writable
            {
                return Err(fail(Error::Accounts));
            }
            system_check(system)?;
            if token_program.key != &spl_token::id() || !token_program.executable {
                return Err(fail(Error::Identity));
            }
            let (creator, initial_inventory) = custody(state, mint, program)?;
            let minted = Mint::unpack(&mint.try_borrow_data()?)?;
            if creator.checked_add(initial_inventory) != Some(minted.supply) {
                return Err(fail(Error::Configuration));
            }
            let vault_data =
                vault_check(vault, state.key, mint.key).map_err(|_| fail(Error::Identity))?;
            let dest = token(destination).map_err(|_| fail(Error::Identity))?;
            if destination.key == vault.key
                || dest.mint != *mint.key
                || dest.owner != *buyer.key
                || dest.state != AccountState::Initialized
            {
                return Err(fail(Error::Identity));
            }
            let (opening_key, opening_bump) =
                Pubkey::find_program_address(&[b"opening", mint.key.as_ref()], program);
            if opening.key != &opening_key || opening.owner != program {
                return Err(fail(Error::Identity));
            }
            let open = opening.try_borrow_data()?;
            if open.len() != OPEN_LEN
                || &open[..8] != OPEN_MAGIC
                || &open[8..40] != mint.key.as_ref()
                || &open[40..72] != state.key.as_ref()
                || open[105] != opening_bump
            {
                return Err(fail(Error::Identity));
            }
            let cap = u64_at(&open, 72);
            let end = u64_at(&open, 88);
            let enabled = open[96] == 1;
            let distributed = u64_at(&open, 97);
            let (receipt_key, receipt_bump) = Pubkey::find_program_address(
                &[b"buyer", mint.key.as_ref(), buyer.key.as_ref()],
                program,
            );
            if receipt.key != &receipt_key {
                return Err(fail(Error::Identity));
            }
            let received = if receipt.owner == program {
                let data = receipt.try_borrow_data()?;
                if data.len() != RECEIPT_LEN
                    || &data[..8] != BUY_MAGIC
                    || &data[8..40] != mint.key.as_ref()
                    || &data[40..72] != buyer.key.as_ref()
                    || data[80] != receipt_bump
                {
                    return Err(fail(Error::Identity));
                }
                u64_at(&data, 72)
            } else if receipt.owner == &system_program::id() && receipt.data_is_empty() {
                0
            } else {
                return Err(fail(Error::Identity));
            };
            let amount = u64_at(input, 1);
            if amount == 0 {
                return Err(fail(Error::Amount));
            }
            let next = received
                .checked_add(amount)
                .ok_or(fail(Error::Arithmetic))?;
            if enabled && Clock::get()?.slot < end && next > cap {
                return Err(fail(Error::CapExceeded));
            }
            if amount > vault_data.amount {
                return Err(fail(Error::Inventory));
            }
            let next_distributed = distributed
                .checked_add(amount)
                .ok_or(fail(Error::Arithmetic))?;
            if next_distributed > initial_inventory {
                return Err(fail(Error::Inventory));
            }
            drop(open);
            if receipt.owner != program {
                allocate(
                    buyer,
                    receipt,
                    system,
                    program,
                    RECEIPT_LEN,
                    &[
                        b"buyer",
                        mint.key.as_ref(),
                        buyer.key.as_ref(),
                        &[receipt_bump],
                    ],
                )?;
            }
            let (_, bump) = Pubkey::find_program_address(&[SEED, mint.key.as_ref()], program);
            invoke_signed(
                &spl_token::instruction::transfer_checked(
                    &spl_token::id(),
                    vault.key,
                    mint.key,
                    destination.key,
                    state.key,
                    &[],
                    amount,
                    minted.decimals,
                )?,
                &[
                    vault.clone(),
                    mint.clone(),
                    destination.clone(),
                    state.clone(),
                    token_program.clone(),
                ],
                &[&[SEED, mint.key.as_ref(), &[bump]]],
            )?;
            let mut data = receipt.try_borrow_mut_data()?;
            data[..8].copy_from_slice(BUY_MAGIC);
            data[8..40].copy_from_slice(mint.key.as_ref());
            data[40..72].copy_from_slice(buyer.key.as_ref());
            data[72..80].copy_from_slice(&next.to_le_bytes());
            data[80] = receipt_bump;
            opening.try_borrow_mut_data()?[97..105]
                .copy_from_slice(&next_distributed.to_le_bytes());
            Ok(())
        }
        _ => Err(fail(Error::Encoding)),
    }
}
