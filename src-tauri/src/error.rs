use serde::Serialize;

/// What a failed command rejects with on the JS side: `{ code, message }`.
#[derive(Debug, Serialize)]
pub struct CmdError {
    code: &'static str,
    message: String,
}

impl From<vault_core::Error> for CmdError {
    fn from(e: vault_core::Error) -> Self {
        CmdError { code: e.code(), message: e.to_string() }
    }
}

pub type CmdResult<T> = Result<T, CmdError>;

impl CmdError {
    pub fn invalid(message: impl Into<String>) -> Self {
        CmdError { code: "invalid", message: message.into() }
    }

    pub fn poisoned() -> Self {
        CmdError { code: "internal", message: "vault lock poisoned".into() }
    }
}
