//! Mainnet-only release control. The authority never touches reserves or vaults.
use super::*;

const SEED: &[u8] = b"release-control";
const MAGIC: &[u8; 8] = b"JEETCTL1";
const LEN: usize = 10;
const CLOSED: u8 = 0;
const OWNER_ONLY: u8 = 1;
const PUBLIC: u8 = 2;

fn settings(program: &Pubkey, control: &AccountInfo) -> Result<u8, ProgramError> {
    let (key, bump) = Pubkey::find_program_address(&[SEED], program);
    if control.key != &key || control.owner != program || control.executable {
        return Err(ProgramError::InvalidAccountData);
    }
    let data = control.try_borrow_data()?;
    if data.len() != LEN || &data[..8] != MAGIC || data[8] != bump || data[9] > PUBLIC {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(data[9])
}

pub(super) fn admit<'a, 'info>(
    program: &Pubkey,
    accounts: &'a [AccountInfo<'info>],
) -> Result<&'a [AccountInfo<'info>], ProgramError> {
    let (control, accounts) = accounts.split_last().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let payer = accounts.first().ok_or(ProgramError::NotEnoughAccountKeys)?;
    if control.is_signer || control.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }
    match settings(program, control)? {
        PUBLIC => Ok(accounts),
        OWNER_ONLY if payer.is_signer && payer.key == &CONTAINMENT_AUTHORITY => Ok(accounts),
        _ => Err(ProgramError::Custom(1700)),
    }
}

pub(super) fn configure(program: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let Some(authority) = accounts.first() else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !authority.is_signer || authority.key != &CONTAINMENT_AUTHORITY {
        return Err(ProgramError::MissingRequiredSignature);
    }
    match (data, accounts) {
        ([24], [authority, control, system]) => {
            let (key, bump) = Pubkey::find_program_address(&[SEED], program);
            if !authority.is_writable
                || authority.owner != &system_program::id()
                || !authority.data_is_empty()
                || control.key != &key
                || !control.is_writable
                || system.key != &system_program::id()
                || !system.executable
            {
                return Err(ProgramError::InvalidAccountData);
            }
            caps::allocate(authority, control, system, program, LEN, &[SEED, &[bump]])?;
            let mut state = control.try_borrow_mut_data()?;
            state[..8].copy_from_slice(MAGIC);
            state[8] = bump;
            state[9] = CLOSED;
            Ok(())
        }
        ([25, mode], [_, control]) if *mode <= PUBLIC && control.is_writable => {
            settings(program, control)?;
            control.try_borrow_mut_data()?[9] = *mode;
            Ok(())
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_authority_opens_and_pause_blocks_exposure() {
        let program = id();
        let system = system_program::id();
        let (control_key, bump) = Pubkey::find_program_address(&[SEED], &program);
        let outsider = Pubkey::new_unique();
        let mut authority_lamports = 0;
        let mut outsider_lamports = 0;
        let mut control_lamports = 0;
        let mut authority_data = [];
        let mut outsider_data = [];
        let mut data = [0; LEN];
        data[..8].copy_from_slice(MAGIC);
        data[8] = bump;
        let admin = AccountInfo::new(&CONTAINMENT_AUTHORITY, true, false, &mut authority_lamports,
            &mut authority_data, &system, false, 0);
        let guest = AccountInfo::new(&outsider, true, false, &mut outsider_lamports,
            &mut outsider_data, &system, false, 0);
        let writable = AccountInfo::new(&control_key, false, true, &mut control_lamports,
            &mut data, &program, false, 0);
        let mut readonly = writable.clone();
        readonly.is_writable = false;
        assert_eq!(admit(&program, &[admin.clone(), readonly.clone()]).err(), Some(ProgramError::Custom(1700)));
        assert_eq!(configure(&program, &[guest.clone(), writable.clone()], &[25, PUBLIC]),
            Err(ProgramError::MissingRequiredSignature));
        assert!(configure(&program, &[admin.clone(), writable.clone()], &[25, OWNER_ONLY]).is_ok());
        assert!(admit(&program, &[admin.clone(), readonly.clone()]).is_ok());
        assert!(admit(&program, &[guest.clone(), readonly.clone()]).is_err());
        assert!(configure(&program, &[admin.clone(), writable.clone()], &[25, PUBLIC]).is_ok());
        assert!(admit(&program, &[guest.clone(), readonly.clone()]).is_ok());
        assert!(admit(&program, &[guest.clone(), writable.clone()]).is_err());
        assert!(configure(&program, &[admin, writable], &[25, CLOSED]).is_ok());
        assert!(admit(&program, &[guest, readonly]).is_err());
        assert_eq!(process_instruction(&program, &[], &[3]), Err(ProgramError::InvalidInstructionData));
        assert_eq!(process_instruction(&program, &[], &[19]), Err(ProgramError::NotEnoughAccountKeys));
        // These reach their existing handlers even though no release-control account was supplied.
        assert_eq!(process_instruction(&program, &[], &[20]), Err(ProgramError::Custom(1500)));
        assert_eq!(process_instruction(&program, &[], &[10]), Err(ProgramError::Custom(1300)));
    }
}
