#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0} not found")]
    NotFound(&'static str),
    #[error("{0}")]
    Invalid(String),
    #[error("{0}")]
    Conflict(String),
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("image error: {0}")]
    Image(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

impl Error {
    /// Stable machine-readable code, sent to the frontend alongside the message.
    pub fn code(&self) -> &'static str {
        match self {
            Error::NotFound(_) => "not_found",
            Error::Invalid(_) => "invalid",
            Error::Conflict(_) => "conflict",
            Error::Db(_) => "db",
            Error::Image(_) => "image",
            Error::Io(_) => "io",
        }
    }

    pub(crate) fn invalid(msg: impl Into<String>) -> Self {
        Error::Invalid(msg.into())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
