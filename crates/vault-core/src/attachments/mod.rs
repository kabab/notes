//! Image attachments: stored once per content hash as `attachments/<sha256>.webp`.

pub mod image;

use std::path::{Path, PathBuf};

use rusqlite::{OptionalExtension, params};
use sha2::{Digest, Sha256};

pub use self::image::ProcessedImage;
use crate::changes::{self, Entity, Op};
use crate::time::now_ms;
use crate::{Attachment, Error, Result, Vault};

pub const DIR: &str = "attachments";

/// Processes raw image bytes. CPU-heavy and needs no database, so callers can run it
/// without holding the vault lock, then pass the result to [`Vault::store_attachment`].
pub fn process_image(bytes: &[u8]) -> Result<ProcessedImage> {
    image::process(bytes)
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

impl Vault {
    pub fn attachments_dir(&self) -> Result<PathBuf> {
        let dir = self.data_dir.as_ref().ok_or_else(|| Error::invalid("vault has no data directory"))?;
        Ok(dir.join(DIR))
    }

    /// Saves a processed image (if not already stored) and records it. Identical images
    /// are stored once: the name is the SHA-256 of the WebP bytes.
    pub fn store_attachment(&mut self, image: &ProcessedImage, original_name: Option<&str>) -> Result<Attachment> {
        let hash = sha256_hex(&image.webp);
        let dir = self.attachments_dir()?;
        std::fs::create_dir_all(&dir)?;
        write_if_missing(&dir.join(format!("{hash}.webp")), &image.webp)?;

        let tx = self.conn.transaction()?;
        if let Some(existing) = get(&tx, &hash)? {
            return Ok(existing);
        }
        let now = now_ms();
        tx.execute(
            "INSERT INTO attachments (hash, original_name, mime, size, width, height, created_at)
             VALUES (?1, ?2, 'image/webp', ?3, ?4, ?5, ?6)",
            params![hash, original_name, image.webp.len() as i64, image.width, image.height, now],
        )?;
        changes::log(&tx, Entity::Attachment, &hash, Op::Create, now)?;
        let attachment = get(&tx, &hash)?.expect("just inserted");
        tx.commit()?;
        Ok(attachment)
    }

    /// Convenience: process + store.
    pub fn add_attachment(&mut self, bytes: &[u8], original_name: Option<&str>) -> Result<Attachment> {
        let image = process_image(bytes)?;
        self.store_attachment(&image, original_name)
    }
}

fn get(conn: &rusqlite::Connection, hash: &str) -> Result<Option<Attachment>> {
    Ok(conn
        .query_row(
            "SELECT hash, original_name, mime, size, width, height, created_at FROM attachments WHERE hash = ?1",
            [hash],
            |r| {
                Ok(Attachment {
                    hash: r.get(0)?,
                    original_name: r.get(1)?,
                    mime: r.get(2)?,
                    size: r.get(3)?,
                    width: r.get(4)?,
                    height: r.get(5)?,
                    created_at: r.get(6)?,
                })
            },
        )
        .optional()?)
}

/// Writes via a temp file + rename so a crash never leaves a truncated attachment.
fn write_if_missing(path: &Path, bytes: &[u8]) -> Result<()> {
    if path.exists() {
        return Ok(());
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use ::image::{DynamicImage, ImageFormat, Rgb, RgbImage};

    use crate::test_util::id;
    use crate::{Error, Vault};

    fn png(color: [u8; 3]) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(RgbImage::from_pixel(16, 16, Rgb(color))).write_to(&mut out, ImageFormat::Png).unwrap();
        out.into_inner()
    }

    #[test]
    fn stores_once_per_content() {
        let dir = std::env::temp_dir().join(format!("vault-att-{}", id()));
        let mut v = Vault::open(&dir).unwrap();

        let a = v.add_attachment(&png([1, 2, 3]), Some("photo.png")).unwrap();
        assert_eq!(a.hash.len(), 64);
        assert_eq!((a.width, a.height, a.mime.as_str()), (16, 16, "image/webp"));
        let file = dir.join("attachments").join(format!("{}.webp", a.hash));
        assert_eq!(std::fs::metadata(&file).unwrap().len() as i64, a.size);

        let again = v.add_attachment(&png([1, 2, 3]), Some("copy.png")).unwrap();
        assert_eq!(again, a, "same image: same row, first name kept");
        let other = v.add_attachment(&png([200, 0, 0]), None).unwrap();
        assert_ne!(other.hash, a.hash);
        assert_eq!(std::fs::read_dir(dir.join("attachments")).unwrap().count(), 2);

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn in_memory_vault_has_no_attachment_dir() {
        let mut v = Vault::open_in_memory().unwrap();
        assert!(matches!(v.add_attachment(&png([0, 0, 0]), None), Err(Error::Invalid(_))));
    }
}
