//! Platform Seeding and Bootstrap Operations
//!
//! Provides transactional bootstrapping of platform administration,
//! system configuration, initial workspace settings, and starter documentation.

pub mod bootstrap;
pub mod starter_docs;

pub use bootstrap::{bootstrap_platform, BootstrapSummary, PlatformBootstrapOptions};
pub use starter_docs::create_starter_project;
