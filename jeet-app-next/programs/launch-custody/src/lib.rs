//! Local launch custody and cumulative opening wallet caps.
mod caps;
mod curve;
mod fees;
mod market;
mod protected;
#[cfg(feature = "local-fee-test")]
mod v5;
#[cfg(any(test, feature = "local-fee-test"))]
mod v5_math;

use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, program::invoke_signed,
    program_error::ProgramError, program_option::COption, program_pack::Pack, pubkey::Pubkey,
    rent::Rent, sysvar::Sysvar,
};
use solana_sdk_ids::system_program;
use solana_system_interface::instruction as system_instruction;
use spl_token::state::{Account as TokenAccount, AccountState, Mint};

#[cfg(not(feature = "local-fee-test"))]
solana_program::declare_id!("7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31");
#[cfg(feature = "local-fee-test")]
solana_program::declare_id!("8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo");
entrypoint!(process_instruction);

const SEED: &[u8] = b"launch";
const MAGIC: &[u8; 8] = b"JEETCST1";
const STATE_LEN: usize = 89;
const ATA_PROGRAM: Pubkey = solana_program::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), spl_token::id().as_ref(), mint.as_ref()],
        &ATA_PROGRAM,
    )
    .0
}

fn token(account: &AccountInfo) -> Result<TokenAccount, ProgramError> {
    if account.owner != &spl_token::id() {
        return Err(ProgramError::IncorrectProgramId);
    }
    TokenAccount::unpack(&account.try_borrow_data()?)
}

fn vault_check(
    vault: &AccountInfo,
    state: &Pubkey,
    mint: &Pubkey,
) -> Result<TokenAccount, ProgramError> {
    let data = token(vault)?;
    if vault.key != &ata(state, mint)
        || data.owner != *state
        || data.mint != *mint
        || data.delegate != COption::None
        || data.delegated_amount != 0
        || data.close_authority != COption::None
        || data.state != AccountState::Initialized
        || data.is_native != COption::None
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(data)
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    input: &[u8],
) -> ProgramResult {
    if program_id != &id() {
        return Err(ProgramError::IncorrectProgramId);
    }
    if matches!(input.first(), Some(16..=20)) {
        #[cfg(feature = "local-fee-test")]
        {
            return v5::process(program_id, accounts, input);
        }
        #[cfg(not(feature = "local-fee-test"))]
        {
            return Err(ProgramError::Custom(1514));
        }
    }
    if matches!(input.first(), Some(11..=15)) {
        return market::process(program_id, accounts, input);
    }
    if matches!(input.first(), Some(4 | 5 | 6 | 7)) {
        return curve::process(program_id, accounts, input);
    }
    if matches!(input.first(), Some(2 | 3 | 8)) {
        return caps::process(program_id, accounts, input);
    }
    if matches!(input.first(), Some(9 | 10)) {
        return fees::process(program_id, accounts, input);
    }
    match input.first() {
        // Initialize after funding: payer, mint, creator ATA (or token program for zero allocation),
        // state PDA, vault ATA, system program, token program.
        Some(0) if input.len() == 49 && accounts.len() == 7 => {
            let payer = &accounts[0];
            let mint = &accounts[1];
            let creator_account = &accounts[2];
            let state = &accounts[3];
            let vault = &accounts[4];
            let system = &accounts[5];
            let token_program = &accounts[6];
            if !payer.is_signer {
                return Err(ProgramError::MissingRequiredSignature);
            }
            if !payer.is_writable || !state.is_writable {
                return Err(ProgramError::InvalidAccountData);
            }
            if system.key != &system_program::id()
                || !system.executable
                || token_program.key != &spl_token::id()
                || !token_program.executable
                || mint.owner != &spl_token::id()
            {
                return Err(ProgramError::IncorrectProgramId);
            }
            let creator = Pubkey::new_from_array(input[1..33].try_into().unwrap());
            let creator_amount = u64::from_le_bytes(input[33..41].try_into().unwrap());
            let inventory_amount = u64::from_le_bytes(input[41..49].try_into().unwrap());
            let (expected, bump) =
                Pubkey::find_program_address(&[SEED, mint.key.as_ref()], program_id);
            if state.key != &expected || creator == expected {
                return Err(ProgramError::InvalidSeeds);
            }
            if state.owner != &system_program::id() || !state.data_is_empty() {
                return Err(ProgramError::AccountAlreadyInitialized);
            }
            let mint_data = Mint::unpack(&mint.try_borrow_data()?)?;
            if mint_data.mint_authority != COption::Some(*payer.key) {
                return Err(ProgramError::MissingRequiredSignature);
            }
            if inventory_amount == 0
                || creator_amount.checked_add(inventory_amount) != Some(mint_data.supply)
                || u128::from(creator_amount) * 100 > u128::from(mint_data.supply) * 5
            {
                return Err(ProgramError::InvalidInstructionData);
            }
            let vault_data = vault_check(vault, state.key, mint.key)?;
            if vault_data.amount != inventory_amount {
                return Err(ProgramError::InvalidAccountData);
            }
            if creator_amount == 0 {
                if creator_account.key != &spl_token::id() {
                    return Err(ProgramError::InvalidAccountData);
                }
            } else {
                let data = token(creator_account)?;
                if creator_account.key != &ata(&creator, mint.key)
                    || data.owner != creator
                    || data.mint != *mint.key
                    || data.amount != creator_amount
                {
                    return Err(ProgramError::InvalidAccountData);
                }
            }
            let signer_seeds: &[&[u8]] = &[SEED, mint.key.as_ref(), &[bump]];
            // Top up and allocate instead of create_account so an unsolicited SOL transfer
            // cannot prevent initialization of the deterministic PDA.
            let rent = Rent::get()?.minimum_balance(STATE_LEN);
            if state.lamports() < rent {
                solana_program::program::invoke(
                    &system_instruction::transfer(payer.key, state.key, rent - state.lamports()),
                    &[payer.clone(), state.clone(), system.clone()],
                )?;
            }
            invoke_signed(
                &system_instruction::allocate(state.key, STATE_LEN as u64),
                &[state.clone(), system.clone()],
                &[signer_seeds],
            )?;
            invoke_signed(
                &system_instruction::assign(state.key, program_id),
                &[state.clone(), system.clone()],
                &[signer_seeds],
            )?;
            let mut data = state.try_borrow_mut_data()?;
            data[..8].copy_from_slice(MAGIC);
            data[8..40].copy_from_slice(mint.key.as_ref());
            data[40..72].copy_from_slice(creator.as_ref());
            data[72..80].copy_from_slice(&creator_amount.to_le_bytes());
            data[80..88].copy_from_slice(&inventory_amount.to_le_bytes());
            data[88] = bump;
            Ok(())
        }
        // Prove PDA signing through a non-spending Token Program revoke CPI.
        // Permissionless and idempotent; accepts only this state's canonical vault.
        Some(1) if input.len() == 1 && accounts.len() == 4 => {
            let state = &accounts[0];
            let mint = &accounts[1];
            let vault = &accounts[2];
            let token_program = &accounts[3];
            if state.owner != program_id
                || mint.owner != &spl_token::id()
                || token_program.key != &spl_token::id()
                || !token_program.executable
            {
                return Err(ProgramError::IncorrectProgramId);
            }
            let (expected, bump) =
                Pubkey::find_program_address(&[SEED, mint.key.as_ref()], program_id);
            let data = state.try_borrow_data()?;
            if state.key != &expected
                || data.len() != STATE_LEN
                || &data[..8] != MAGIC
                || &data[8..40] != mint.key.as_ref()
                || data[88] != bump
            {
                return Err(ProgramError::InvalidAccountData);
            }
            vault_check(vault, state.key, mint.key)?;
            if !vault.is_writable {
                return Err(ProgramError::InvalidAccountData);
            }
            drop(data);
            invoke_signed(
                &spl_token::instruction::revoke(&spl_token::id(), vault.key, state.key, &[])?,
                &[vault.clone(), state.clone(), token_program.clone()],
                &[&[SEED, mint.key.as_ref(), &[bump]]],
            )
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
