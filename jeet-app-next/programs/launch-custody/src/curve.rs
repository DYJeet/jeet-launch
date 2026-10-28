//! Discrete linear marginal pricing; all amounts are integer base units / lamports.
use super::*;
use solana_program::program::set_return_data;
const LEN: usize = 153;
pub const FEE_MAGIC: &[u8] = b"JEETCRV3";
const MAGIC_CURVE: &[u8] = b"JEETCRV1";
fn error(code: u32) -> ProgramError {
    ProgramError::Custom(code)
}
fn read(data: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(data[at..at + 8].try_into().unwrap())
}
#[derive(Clone, Copy)]
pub struct Curve {
    pub fees: bool,
    pub base: u64,
    pub slope: u64,
    pub scale: u64,
    pub sold: u64,
    pub collected: u64,
    pub inventory: u64,
    pub protection: Option<super::protected::Protection>,
}
// ceil((base*n*scale + slope*(sold*n+n*(n-1)/2)) / scale^2)
pub fn cost(c: &Curve, n: u64) -> Result<u64, ProgramError> {
    if n == 0 {
        return Err(error(1101));
    }
    let n = u128::from(n);
    let scale = u128::from(c.scale);
    let arithmetic = || error(1108);
    let series = n
        .checked_mul(n - 1)
        .and_then(|v| v.checked_div(2))
        .and_then(|v| {
            u128::from(c.sold)
                .checked_mul(n)
                .and_then(|s| s.checked_add(v))
        })
        .ok_or_else(arithmetic)?;
    let initial = u128::from(c.base)
        .checked_mul(n)
        .and_then(|v| v.checked_mul(scale))
        .ok_or_else(arithmetic)?;
    let numerator = u128::from(c.slope)
        .checked_mul(series)
        .and_then(|v| v.checked_add(initial))
        .ok_or_else(arithmetic)?;
    let denominator = scale
        .checked_mul(scale)
        .filter(|v| *v > 0)
        .ok_or_else(arithmetic)?;
    let rounded = (numerator / denominator)
        .checked_add(u128::from(numerator % denominator != 0))
        .ok_or_else(arithmetic)?;
    u64::try_from(rounded).map_err(|_| error(1108))
}
pub fn load(
    program: &Pubkey,
    mint: &AccountInfo,
    custody: &AccountInfo,
    opening: &AccountInfo,
    curve: &AccountInfo,
    vault: &AccountInfo,
) -> Result<Curve, ProgramError> {
    let (key, bump) = Pubkey::find_program_address(&[b"curve", mint.key.as_ref()], program);
    if curve.key != &key || curve.owner != program || curve.executable {
        return Err(error(1102));
    }
    let data = curve.try_borrow_data()?;
    let legacy = data.len() == LEN && &data[..8] == MAGIC_CURVE;
    let fee_enabled = data.len() == super::protected::LEN && &data[..8] == FEE_MAGIC;
    let protected = data.len() == super::protected::LEN
        && (&data[..8] == super::protected::MAGIC || fee_enabled);
    if (!legacy && !protected)
        || &data[8..40] != mint.key.as_ref()
        || &data[40..72] != custody.key.as_ref()
        || &data[72..104] != opening.key.as_ref()
        || data[152] != bump
    {
        return Err(error(1102));
    }
    let (creator, inventory) = super::caps::custody(custody, mint, program)?;
    let minted = Mint::unpack(&mint.try_borrow_data()?)?;
    let (opening_key, _) = Pubkey::find_program_address(&[b"opening", mint.key.as_ref()], program);
    let open = opening.try_borrow_data()?;
    if opening.key != &opening_key
        || opening.owner != program
        || open.len() != 108
        || &open[..8] != b"JEETOPN1"
        || &open[8..40] != mint.key.as_ref()
        || &open[40..72] != custody.key.as_ref()
        || creator.checked_add(inventory) != Some(minted.supply)
        || minted.decimals > 9
    {
        return Err(error(1102));
    }
    let c = Curve {
        fees: fee_enabled,
        base: read(&data, 104),
        slope: read(&data, 112),
        scale: read(&data, 120),
        sold: read(&data, 128),
        collected: read(&data, 136),
        inventory: read(&data, 144),
        protection: if protected {
            Some(super::protected::decode(
                &data,
                minted.supply,
                inventory,
                &open,
            )?)
        } else {
            None
        },
    };
    if c.base == 0
        || c.scale != 10u64.pow(u32::from(minted.decimals))
        || c.inventory != inventory
        || c.sold != read(&open, 97)
    {
        return Err(error(1102));
    }
    let remaining = c.inventory.checked_sub(c.sold).ok_or(error(1108))?;
    if vault_check(vault, custody.key, mint.key)?.amount < remaining {
        return Err(error(1102));
    }
    let reserve = Rent::get()?
        .minimum_balance(data.len())
        .checked_add(c.collected)
        .ok_or(error(1108))?;
    if curve.lamports() < reserve {
        return Err(error(1102));
    }
    Ok(c)
}
// All cap checks happen before this method; all changes remain in the same transaction.
pub fn pay<'a>(
    program: &Pubkey,
    buyer: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    custody: &AccountInfo<'a>,
    opening: &AccountInfo<'a>,
    curve: &AccountInfo<'a>,
    vault: &AccountInfo<'a>,
    system: &AccountInfo<'a>,
    input: &[u8],
    cumulative_received: u64,
    all_accounts: &[AccountInfo<'a>],
) -> ProgramResult {
    if !curve.is_writable || buyer.owner != &system_program::id() || !buyer.data_is_empty() {
        return Err(error(1102));
    }
    let c = load(program, mint, custody, opening, curve, vault)?;
    if let Some(protection) = c.protection {
        protection.enforce(
            solana_program::clock::Clock::get()?.slot,
            cumulative_received,
        )?;
    }
    if c.fees != (input[0] == 8) {
        return Err(error(1306));
    }
    if read(input, 9) != c.sold {
        return Err(error(1104));
    }
    let n = read(input, 1);
    let required = cost(&c, n)?;
    if required != read(input, 17) || (!c.fees && required > read(input, 25)) {
        return Err(error(1105));
    }
    let sold = c
        .sold
        .checked_add(n)
        .filter(|v| *v <= c.inventory)
        .ok_or(error(1108))?;
    let collected = c.collected.checked_add(required).ok_or(error(1108))?;
    curve.lamports().checked_add(required).ok_or(error(1108))?;
    if !c.fees && buyer.lamports() < required {
        return Err(error(1106));
    }
    if c.fees {
        super::fees::collect(program, all_accounts, required, read(input, 25))?;
    }
    solana_program::program::invoke(
        &system_instruction::transfer(buyer.key, curve.key, required),
        &[buyer.clone(), curve.clone(), system.clone()],
    )?;
    let mut data = curve.try_borrow_mut_data()?;
    data[128..136].copy_from_slice(&sold.to_le_bytes());
    data[136..144].copy_from_slice(&collected.to_le_bytes());
    Ok(())
}
pub fn process(program: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
    match input.first() {
        Some(4 | 6 | 7) => {
            let fees = input[0] == 7;
            let protected = input[0] != 4;
            if input.len() != if protected { 35 } else { 17 }
                || accounts.len() != if fees { 10 } else { 7 }
            {
                return Err(error(1100));
            }
            let payer = &accounts[0];
            let mint = &accounts[1];
            let custody = &accounts[2];
            let opening = &accounts[3];
            let curve = &accounts[4];
            let vault = &accounts[5];
            let system = &accounts[6];
            if !payer.is_signer {
                return Err(error(1107));
            }
            if !payer.is_writable
                || !curve.is_writable
                || system.key != &system_program::id()
                || !system.executable
            {
                return Err(error(1102));
            }
            let (creator, inventory) = super::caps::custody(custody, mint, program)?;
            let minted = Mint::unpack(&mint.try_borrow_data()?)?;
            if minted.mint_authority != COption::Some(*payer.key) {
                return Err(error(1107));
            }
            let (opening_key, _) =
                Pubkey::find_program_address(&[b"opening", mint.key.as_ref()], program);
            let open = opening.try_borrow_data()?;
            if opening.key != &opening_key
                || opening.owner != program
                || open.len() != 108
                || &open[..8] != b"JEETOPN1"
                || &open[8..40] != mint.key.as_ref()
                || &open[40..72] != custody.key.as_ref()
                || read(&open, 97) != 0
                || creator.checked_add(inventory) != Some(minted.supply)
                || vault_check(vault, custody.key, mint.key)?.amount != inventory
            {
                return Err(error(1102));
            }
            let base = read(input, 1);
            let slope = read(input, 9);
            if base == 0 || minted.decimals > 9 {
                return Err(error(1103));
            }
            let (key, bump) = Pubkey::find_program_address(&[b"curve", mint.key.as_ref()], program);
            if curve.key != &key {
                return Err(error(1102));
            }
            if curve.owner != &system_program::id() || !curve.data_is_empty() {
                return Err(error(1109));
            }
            let protection = if protected {
                Some(super::protected::create(
                    solana_program::clock::Clock::get()?.slot,
                    read(input, 17),
                    read(input, 25),
                    u16::from_le_bytes(input[33..35].try_into().unwrap()),
                    minted.supply,
                    inventory,
                    &open,
                )?)
            } else {
                None
            };
            let length = if protected {
                super::protected::LEN
            } else {
                LEN
            };
            super::caps::allocate(
                payer,
                curve,
                system,
                program,
                length,
                &[b"curve", mint.key.as_ref(), &[bump]],
            )?;
            if fees {
                super::fees::initialize(program, accounts, input)?;
            }
            let mut data = curve.try_borrow_mut_data()?;
            data[..8].copy_from_slice(if fees {
                FEE_MAGIC
            } else if protected {
                super::protected::MAGIC
            } else {
                MAGIC_CURVE
            });
            data[8..40].copy_from_slice(mint.key.as_ref());
            data[40..72].copy_from_slice(custody.key.as_ref());
            data[72..104].copy_from_slice(opening.key.as_ref());
            data[104..112].copy_from_slice(&base.to_le_bytes());
            data[112..120].copy_from_slice(&slope.to_le_bytes());
            data[120..128].copy_from_slice(&10u64.pow(u32::from(minted.decimals)).to_le_bytes());
            data[128..144].fill(0);
            data[144..152].copy_from_slice(&inventory.to_le_bytes());
            data[152] = bump;
            if let Some(protection) = protection {
                protection.write(&mut data);
            }
            Ok(())
        }
        Some(5) => {
            if input.len() != 9 || accounts.len() != 5 {
                return Err(error(1100));
            }
            let c = load(
                program,
                &accounts[0],
                &accounts[1],
                &accounts[2],
                &accounts[3],
                &accounts[4],
            )?;
            let n = read(input, 1);
            if n > c.inventory.checked_sub(c.sold).ok_or(error(1108))? {
                return Err(error(1110));
            }
            let required = cost(&c, n)?;
            let mut data = [0u8; 32];
            data[..8].copy_from_slice(&required.to_le_bytes());
            data[8..16].copy_from_slice(&c.sold.to_le_bytes());
            data[16..24].copy_from_slice(&c.collected.to_le_bytes());
            data[24..32].copy_from_slice(&n.to_le_bytes());
            set_return_data(&data);
            Ok(())
        }
        _ => Err(error(1100)),
    }
}
