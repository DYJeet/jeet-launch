//! Opt-in immutable opening metadata. No privileged runtime override or clock input.
use super::*;
pub const LEN: usize = 204;
pub const MAGIC: &[u8] = b"JEETCRV2";
fn error(code: u32) -> ProgramError {
    ProgramError::Custom(code)
}
fn read(data: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(data[at..at + 8].try_into().unwrap())
}
#[derive(Clone, Copy)]
pub struct Protection {
    pub created: u64,
    pub start: u64,
    pub duration: u64,
    pub end: u64,
    pub limit: u64,
    pub delay: u64,
    pub bps: u16,
}
pub fn window(created: u64, delay: u64, duration: u64) -> Result<(u64, u64), ProgramError> {
    if delay > 1_000_000 || duration == 0 || duration > 1_000_000 {
        return Err(error(1202));
    }
    let start = created.checked_add(delay).ok_or(error(1204))?;
    let end = start.checked_add(duration).ok_or(error(1204))?;
    Ok((start, end))
}
impl Protection {
    pub fn enforce(&self, slot: u64, cumulative: u64) -> ProgramResult {
        if slot < self.start {
            return Err(error(1200));
        }
        if slot < self.end && cumulative > self.limit {
            return Err(error(1201));
        }
        Ok(())
    }
    pub fn write(&self, data: &mut [u8]) {
        data[153] = 1;
        for (at, value) in [
            (154, self.created),
            (162, self.start),
            (170, self.duration),
            (178, self.end),
            (186, self.limit),
            (194, self.delay),
        ] {
            data[at..at + 8].copy_from_slice(&value.to_le_bytes());
        }
        data[202..204].copy_from_slice(&self.bps.to_le_bytes());
    }
}
pub fn create(
    created: u64,
    delay: u64,
    duration: u64,
    bps: u16,
    supply: u64,
    inventory: u64,
    open: &[u8],
) -> Result<Protection, ProgramError> {
    let (start, end) = window(created, delay, duration)?;
    if bps > 10000 || open.len() != 108 || open[96] > 1 {
        return Err(error(1202));
    }
    let limit = u64::try_from(
        u128::from(supply)
            .checked_mul(u128::from(bps))
            .ok_or(error(1204))?
            / 10000,
    )
    .map_err(|_| error(1204))?;
    let cap = read(open, 72);
    // Opt-in protection is strictly tighter than the effective ordinary inventory/cap budget.
    if limit >= inventory
        || (open[96] == 1
            && ((cap > 0 && limit >= cap) || (cap == 0 && limit != 0) || end > read(open, 88)))
    {
        return Err(error(1202));
    }
    Ok(Protection {
        created,
        start,
        duration,
        end,
        limit,
        delay,
        bps,
    })
}
pub fn decode(
    data: &[u8],
    supply: u64,
    inventory: u64,
    open: &[u8],
) -> Result<Protection, ProgramError> {
    if data.len() != LEN
        || (&data[..8] != MAGIC
            && &data[..8] != super::curve::FEE_MAGIC
            && &data[..8] != super::market::MAGIC)
        || data[153] != 1
    {
        return Err(error(1203));
    }
    let p = create(
        read(data, 154),
        read(data, 194),
        read(data, 170),
        u16::from_le_bytes(data[202..204].try_into().unwrap()),
        supply,
        inventory,
        open,
    )
    .map_err(|_| error(1203))?;
    if p.start != read(data, 162) || p.end != read(data, 178) || p.limit != read(data, 186) {
        return Err(error(1203));
    }
    Ok(p)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checked_slot_overflow() {
        assert_eq!(window(u64::MAX, 1, 1).err(), Some(error(1204)));
        assert_eq!(window(u64::MAX, 0, 1).err(), Some(error(1204)));
    }
    #[test]
    fn invalid_durations() {
        assert_eq!(window(0, 0, 0).err(), Some(error(1202)));
        assert_eq!(window(0, 0, 1_000_001).err(), Some(error(1202)));
    }
    #[test]
    fn exact_boundaries() {
        let p = Protection {
            created: 10,
            start: 20,
            duration: 5,
            end: 25,
            limit: 10,
            delay: 10,
            bps: 100,
        };
        assert_eq!(p.enforce(19, 1), Err(error(1200)));
        assert_eq!(p.enforce(20, 10), Ok(()));
        assert_eq!(p.enforce(24, 11), Err(error(1201)));
        assert_eq!(p.enforce(25, 11), Ok(()));
        assert_eq!(p.enforce(26, 11), Ok(()));
    }
}
