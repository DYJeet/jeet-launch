//! Checked, path-independent staircase potential. Parameters are not platform defaults.
use solana_program::program_error::ProgramError;
fn overflow() -> ProgramError {
    ProgramError::Custom(1507)
}
fn invalid() -> ProgramError {
    ProgramError::Custom(1503)
}
fn add(a: u128, b: u128) -> Result<u128, ProgramError> {
    a.checked_add(b).ok_or_else(overflow)
}
fn mul(a: u128, b: u128) -> Result<u128, ProgramError> {
    a.checked_mul(b).ok_or_else(overflow)
}
pub fn floor_sum(mut n: u128, mut d: u128, mut a: u128, mut b: u128) -> Result<u128, ProgramError> {
    if d == 0 {
        return Err(invalid());
    }
    if n == 0 {
        return Ok(0);
    }
    let mut out = 0;
    loop {
        if a >= d {
            out = add(
                out,
                mul(mul(n, n.checked_sub(1).ok_or_else(overflow)?)?, a / d)? / 2,
            )?;
            a %= d;
        }
        if b >= d {
            out = add(out, mul(n, b / d)?)?;
            b %= d;
        }
        let y = add(mul(a, n)?, b)?;
        if y < d {
            return Ok(out);
        }
        n = y / d;
        b = y % d;
        std::mem::swap(&mut d, &mut a);
    }
}
#[derive(Clone, Copy)]
pub struct Pricing {
    pub inventory: u64,
    pub quantum: u64,
    pub start: u64,
    pub end: u64,
}
impl Pricing {
    pub fn potential(&self, sold: u64) -> Result<u64, ProgramError> {
        if self.quantum == 0
            || self.inventory % self.quantum != 0
            || self.inventory / self.quantum < 2
            || self.start == 0
            || self.end < self.start
            || sold > self.inventory
            || sold % self.quantum != 0
        {
            return Err(invalid());
        }
        let n = u128::from(sold / self.quantum);
        let d = u128::from(self.inventory / self.quantum - 1);
        let sum = add(
            mul(u128::from(self.start), n)?,
            floor_sum(n, d, u128::from(self.end - self.start), d - 1)?,
        )?;
        u64::try_from(sum).map_err(|_| overflow())
    }
    pub fn raw(&self, sold: u64, n: u64, sell: bool) -> Result<u64, ProgramError> {
        if n == 0 {
            return Err(invalid());
        }
        let before = self.potential(sold)?;
        if sell {
            before
                .checked_sub(self.potential(sold.checked_sub(n).ok_or_else(invalid)?)?)
                .ok_or_else(overflow)
        } else {
            self.potential(sold.checked_add(n).ok_or_else(overflow)?)?
                .checked_sub(before)
                .ok_or_else(overflow)
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn brute_force() {
        for k in 2..80u64 {
            for start in 1..12 {
                let p = Pricing {
                    inventory: k,
                    quantum: 1,
                    start,
                    end: start * 3,
                };
                let mut sum = 0;
                for s in 0..=k {
                    assert_eq!(p.potential(s).unwrap(), sum);
                    if s < k {
                        sum += start + ((p.end - start) * s + k - 2) / (k - 1);
                    }
                }
            }
        }
    }
    #[test]
    fn representative() {
        let p = Pricing {
            inventory: 594000000,
            quantum: 1,
            start: 42,
            end: 126,
        };
        assert_eq!(p.potential(p.inventory).unwrap(), 50192999999);
        assert_eq!(p.raw(0, 1, false).unwrap(), 42);
        assert_eq!(p.raw(p.inventory, 1, true).unwrap(), 126);
        assert_eq!(
            p.raw(p.inventory, p.inventory, true).unwrap(),
            p.potential(p.inventory).unwrap()
        );
    }
    #[test]
    fn legacy_lot_reference() {
        let p = Pricing {
            inventory: 594000000,
            quantum: 1000,
            start: 42000,
            end: 126000,
        };
        assert_eq!(p.potential(p.inventory).unwrap(), 49896296996);
        assert!(p.raw(0, 1, false).is_err());
    }
    #[test]
    fn bounds() {
        let p = Pricing {
            inventory: u64::MAX,
            quantum: 1,
            start: u64::MAX,
            end: u64::MAX,
        };
        assert!(p.potential(u64::MAX).is_err());
        assert!(p.raw(0, 1, true).is_err());
        assert!(p.raw(0, 0, false).is_err());
        assert_eq!(floor_sum(0, 1, 1, 1).unwrap(), 0);
        assert!(floor_sum(u128::MAX, 1, u128::MAX, 0).is_err());
    }
}
