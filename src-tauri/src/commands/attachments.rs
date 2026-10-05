use tauri::State;
use tauri::ipc::{InvokeBody, Request};
use vault_core::{Attachment, attachments};

use super::with_vault;
use crate::AppState;
use crate::error::{CmdError, CmdResult};

#[tauri::command(async)]
pub fn attachments_dir(state: State<'_, AppState>) -> CmdResult<String> {
    with_vault(state, |v| v.attachments_dir().map(|p| p.to_string_lossy().into_owned()))
}

/// Pasted/dropped image. The body is the raw bytes (binary IPC, no JSON array of numbers);
/// the original file name comes URL-encoded in the `x-filename` header.
#[tauri::command(async)]
pub fn add_attachment(state: State<'_, AppState>, request: Request<'_>) -> CmdResult<Attachment> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(CmdError::invalid("expected raw image bytes"));
    };
    let name = request
        .headers()
        .get("x-filename")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .filter(|n| !n.is_empty());
    // Decode/resize/encode without holding the vault lock.
    let image = attachments::process_image(bytes).map_err(CmdError::from)?;
    with_vault(state, |v| v.store_attachment(&image, name.as_deref()))
}

/// Image picked with the file dialog.
#[tauri::command(async)]
pub fn add_attachment_from_path(state: State<'_, AppState>, path: String) -> CmdResult<Attachment> {
    let bytes = std::fs::read(&path).map_err(|e| CmdError::from(vault_core::Error::from(e)))?;
    let name = std::path::Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned());
    let image = attachments::process_image(&bytes).map_err(CmdError::from)?;
    with_vault(state, |v| v.store_attachment(&image, name.as_deref()))
}

/// Minimal `%XX` decoding for the file-name header (sent with `encodeURIComponent`).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(byte) = s.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(h, 16).ok())
        {
            out.push(byte);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn decodes_file_names() {
        assert_eq!(percent_decode("caf%C3%A9%20photo.png"), "café photo.png");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("plain.png"), "plain.png");
    }
}
