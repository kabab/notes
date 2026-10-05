//! Pure image pipeline: decode → apply EXIF orientation → fit within MAX_SIDE → lossy WebP.
//! Re-encoding from pixels drops all metadata (EXIF, GPS, ICC), which is how EXIF is stripped.

use std::io::Cursor;

use image::imageops::FilterType;
use image::{DynamicImage, ImageDecoder, ImageReader};

use crate::{Error, Result};

pub const MAX_SIDE: u32 = 2560;
const WEBP_QUALITY: f32 = 82.0;

#[derive(Debug)]
pub struct ProcessedImage {
    pub webp: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

pub fn process(bytes: &[u8]) -> Result<ProcessedImage> {
    let bad = |e: image::ImageError| Error::Image(e.to_string());

    let mut decoder = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()?
        .into_decoder()
        .map_err(bad)?;
    let orientation = decoder.orientation().map_err(bad)?;
    let mut img = DynamicImage::from_decoder(decoder).map_err(bad)?;
    img.apply_orientation(orientation);

    if img.width() > MAX_SIDE || img.height() > MAX_SIDE {
        img = img.resize(MAX_SIDE, MAX_SIDE, FilterType::Lanczos3); // keeps aspect ratio
    }

    let (width, height) = (img.width(), img.height());
    let webp = if img.color().has_alpha() {
        let rgba = img.to_rgba8();
        webp::Encoder::from_rgba(&rgba, width, height).encode(WEBP_QUALITY).to_vec()
    } else {
        let rgb = img.to_rgb8();
        webp::Encoder::from_rgb(&rgb, width, height).encode(WEBP_QUALITY).to_vec()
    };
    Ok(ProcessedImage { webp, width, height })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, Rgb, RgbImage, Rgba, RgbaImage};

    fn encode(img: DynamicImage, format: ImageFormat) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        img.write_to(&mut out, format).unwrap();
        out.into_inner()
    }

    fn decoded(webp: &[u8]) -> DynamicImage {
        image::load_from_memory_with_format(webp, ImageFormat::WebP).unwrap()
    }

    /// Inserts an EXIF APP1 segment with the given orientation right after the JPEG SOI marker.
    fn with_exif_orientation(jpeg: &[u8], orientation: u8) -> Vec<u8> {
        let mut tiff = b"MM\0\x2a\0\0\0\x08".to_vec(); // big-endian TIFF header, IFD at offset 8
        tiff.extend([0, 1]); // one entry
        tiff.extend([0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0]); // Orientation, SHORT, 1
        tiff.extend([0, 0, 0, 0]); // no next IFD
        let mut payload = b"Exif\0\0".to_vec();
        payload.extend(tiff);
        let len = (payload.len() + 2) as u16;
        let mut out = jpeg[..2].to_vec();
        out.extend([0xFF, 0xE1]);
        out.extend(len.to_be_bytes());
        out.extend(payload);
        out.extend(&jpeg[2..]);
        out
    }

    #[test]
    fn small_png_keeps_size() {
        let png = encode(DynamicImage::ImageRgb8(RgbImage::from_pixel(40, 20, Rgb([200, 10, 10]))), ImageFormat::Png);
        let out = process(&png).unwrap();
        assert_eq!((out.width, out.height), (40, 20));
        assert_eq!(&out.webp[..4], b"RIFF");
        assert_eq!(&out.webp[8..12], b"WEBP");
        assert_eq!(decoded(&out.webp).width(), 40);
    }

    #[test]
    fn large_images_fit_within_max_side() {
        let jpeg = encode(DynamicImage::ImageRgb8(RgbImage::new(3000, 1000)), ImageFormat::Jpeg);
        let out = process(&jpeg).unwrap();
        assert_eq!((out.width, out.height), (2560, 853));

        let tall = encode(DynamicImage::ImageRgb8(RgbImage::new(1000, 5120)), ImageFormat::Png);
        let out = process(&tall).unwrap();
        assert_eq!((out.width, out.height), (500, 2560));
    }

    #[test]
    fn applies_exif_orientation_and_strips_metadata() {
        let jpeg = encode(DynamicImage::ImageRgb8(RgbImage::new(40, 20)), ImageFormat::Jpeg);
        let rotated = with_exif_orientation(&jpeg, 6); // "rotate 90° clockwise"
        assert!(rotated.windows(4).any(|w| w == b"Exif"));

        let out = process(&rotated).unwrap();
        assert_eq!((out.width, out.height), (20, 40));
        assert!(!out.webp.windows(4).any(|w| w == b"EXIF" || w == b"Exif"));
    }

    #[test]
    fn keeps_transparency() {
        let png = encode(DynamicImage::ImageRgba8(RgbaImage::from_pixel(8, 8, Rgba([0, 0, 0, 0]))), ImageFormat::Png);
        let out = process(&png).unwrap();
        assert!(decoded(&out.webp).color().has_alpha());
    }

    #[test]
    fn rejects_non_images() {
        assert!(matches!(process(b"definitely not an image"), Err(Error::Image(_))));
        assert!(matches!(process(&[]), Err(Error::Image(_))));
    }
}
