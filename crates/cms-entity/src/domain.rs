//! Domain entity types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::common::Id;

/// Domain entity
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Domain {
    pub id: Id,
    pub deployment_id: Id,
    pub hostname: String,
    pub is_primary: bool,
    pub ssl_certificate: Option<String>,
    pub ssl_certificate_expires_at: Option<DateTime<Utc>>,
    pub ssl_status: String,
    pub ssl_last_error: Option<String>,
    pub ssl_checked_at: Option<DateTime<Utc>>,
    pub verified_at: Option<DateTime<Utc>>,
    /// Random DNS TXT challenge value. Only exposed to authenticated project members.
    #[serde(default)]
    pub verification_token: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Domain response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct DomainResponse {
    pub id: Id,
    pub deployment_id: Id,
    pub hostname: String,
    pub is_primary: bool,
    pub ssl_certificate: Option<String>,
    pub ssl_certificate_expires_at: Option<DateTime<Utc>>,
    pub ssl_status: String,
    pub ssl_last_error: Option<String>,
    pub ssl_checked_at: Option<DateTime<Utc>>,
    pub verified_at: Option<DateTime<Utc>>,
    pub is_verified: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Domain> for DomainResponse {
    fn from(domain: Domain) -> Self {
        Self {
            id: domain.id,
            deployment_id: domain.deployment_id,
            hostname: domain.hostname,
            is_primary: domain.is_primary,
            ssl_certificate: domain.ssl_certificate,
            ssl_certificate_expires_at: domain.ssl_certificate_expires_at,
            ssl_status: domain.ssl_status,
            ssl_last_error: domain.ssl_last_error,
            ssl_checked_at: domain.ssl_checked_at,
            verified_at: domain.verified_at,
            is_verified: domain.verified_at.is_some(),
            created_at: domain.created_at,
            updated_at: domain.updated_at,
        }
    }
}

/// Create domain request
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema)]
pub struct CreateDomainRequest {
    #[validate(length(min = 1, message = "Deployment ID is required"))]
    pub deployment_id: String,
    #[validate(length(
        min = 1,
        max = 253,
        message = "Hostname must be between 1 and 253 characters"
    ))]
    pub hostname: String,
    #[serde(default)]
    pub is_primary: bool,
}

/// Update domain request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct UpdateDomainRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_primary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssl_certificate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssl_certificate_expires_at: Option<DateTime<Utc>>,
}

/// Verify domain request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct VerifyDomainRequest {
    pub verification_token: String,
}

/// List domains query
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct ListDomainsQuery {
    #[serde(default)]
    pub deployment_id: Option<Id>,
    #[serde(default)]
    pub is_primary: Option<bool>,
    #[serde(default)]
    pub is_verified: Option<bool>,
}

/// Domain verification result
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct DomainVerificationResult {
    pub domain_id: Id,
    pub hostname: String,
    pub is_verified: bool,
    pub verification_token: Option<String>,
}

/// DNS record challenge information for domain verification
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct DnsRecord {
    pub r#type: String,
    pub name: String,
    pub value: String,
    pub ttl: u32,
}

/// Domain representation expected by the Studio SPA
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SpaDomainResponse {
    pub id: Id,
    pub domain: String,
    pub verified: bool,
    pub is_primary: bool,
    pub dns_status: String,
    pub ssl_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssl_certificate_expires_at: Option<DateTime<Utc>>,
    pub verification_token: String,
    pub records: Vec<DnsRecord>,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_checked_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

impl SpaDomainResponse {
    pub fn from_domain(d: &Domain) -> Self {
        let verified = d.verified_at.is_some();
        let dns_status = if verified { "VERIFIED" } else { "PENDING" };
        let record_name = format!("_cms-rs-verification.{}", d.hostname);
        let record_value = format!("cms-rs-verification={}", d.verification_token);

        Self {
            id: d.id.clone(),
            domain: d.hostname.clone(),
            verified,
            is_primary: d.is_primary,
            dns_status: dns_status.to_string(),
            ssl_status: d.ssl_status.clone(),
            ssl_certificate_expires_at: d.ssl_certificate_expires_at,
            verification_token: d.verification_token.clone(),
            records: vec![DnsRecord {
                r#type: "TXT".to_string(),
                name: record_name,
                value: record_value,
                ttl: 300,
            }],
            created_at: d.created_at,
            verified_at: d.verified_at,
            last_checked_at: d.ssl_checked_at,
            last_error: d.ssl_last_error.clone(),
        }
    }
}

/// Request to add a domain to a project
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema)]
pub struct AddProjectDomainRequest {
    #[validate(length(min = 1, max = 253, message = "Domain is required"))]
    pub domain: String,
}

/// Delete domain response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct DeleteDomainResponse {
    pub success: bool,
    pub id: Id,
}

impl DeleteDomainResponse {
    pub fn new(id: impl Into<Id>) -> Self {
        Self {
            success: true,
            id: id.into(),
        }
    }
}
