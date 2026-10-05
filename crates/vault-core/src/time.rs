use std::time::{SystemTime, UNIX_EPOCH};

/// Current time as Unix milliseconds (UTC). All timestamps in the DB use this.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Validates a calendar date in `YYYY-MM-DD` form (daily-note dates are local, without time zone).
pub fn check_date(date: &str) -> crate::Result<()> {
    let invalid = || crate::Error::invalid(format!("invalid date: {date} (expected YYYY-MM-DD)"));
    let b = date.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return Err(invalid());
    }
    let num = |s: &str| s.bytes().all(|c| c.is_ascii_digit()).then(|| s.parse::<u32>().ok()).flatten();
    let (Some(y), Some(m), Some(d)) = (num(&date[0..4]), num(&date[5..7]), num(&date[8..10])) else {
        return Err(invalid());
    };
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return Err(invalid()),
    };
    if d == 0 || d > days {
        return Err(invalid());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::check_date;

    #[test]
    fn validates_dates() {
        for ok in ["2026-10-05", "2024-02-29", "2000-02-29", "1999-12-31"] {
            assert!(check_date(ok).is_ok(), "{ok}");
        }
        for bad in ["2026-1-05", "2026/10/05", "2026-13-01", "2026-00-10", "2026-04-31", "2023-02-29", "1900-02-29", "2026-10-5x", "+026-10-05", ""] {
            assert!(check_date(bad).is_err(), "{bad}");
        }
    }
}
