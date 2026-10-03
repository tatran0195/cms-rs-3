use std::{path::Path, time::Duration};

use async_trait::async_trait;
use bytes::Bytes;
use cms_error::AppError;

use crate::traits::{DownloadTarget, Storage, UploadTarget};

/// Local filesystem storage implementation
pub struct LocalFsStorage {
    root_dir: String,
}

impl LocalFsStorage {
    /// Create a new LocalFsStorage instance
    pub fn new(root_dir: String) -> Self {
        Self { root_dir }
    }

    /// Get the safe full path for a key, preventing path traversal attacks
    fn get_path(&self, key: &str) -> Result<std::path::PathBuf, AppError> {
        let normalized = key.replace('\\', "/");
        let path = Path::new(&normalized);
        for component in path.components() {
            match component {
                std::path::Component::ParentDir => {
                    return Err(AppError::InvalidInput(
                        "Path traversal detected".to_string(),
                    ));
                }
                std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                    return Err(AppError::InvalidInput(
                        "Absolute paths not allowed in storage keys".to_string(),
                    ));
                }
                _ => {}
            }
        }

        let root = Path::new(&self.root_dir);
        Ok(root.join(path))
    }

    /// Ensure parent directory exists
    async fn ensure_parent_exists(&self, key: &str) -> Result<(), AppError> {
        let path = self.get_path(key)?;
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Storage(format!("Failed to create directory: {}", e)))?;
        }
        Ok(())
    }
}

#[async_trait]
impl Storage for LocalFsStorage {
    async fn put(&self, key: &str, body: Bytes, _content_type: &str) -> Result<(), AppError> {
        self.ensure_parent_exists(key).await?;

        let path = self.get_path(key)?;
        tokio::fs::write(&path, &body)
            .await
            .map_err(|e| AppError::Storage(format!("Failed to write file: {}", e)))?;

        Ok(())
    }

    async fn get(&self, key: &str) -> Result<Bytes, AppError> {
        let path = self.get_path(key)?;
        let bytes = tokio::fs::read(&path).await.map_err(|e| {
            if e.to_string().contains("No such file") {
                AppError::ObjectNotFound(key.to_string())
            } else {
                AppError::Storage(format!("Failed to read file: {}", e))
            }
        })?;

        Ok(Bytes::from(bytes))
    }

    async fn delete(&self, key: &str) -> Result<(), AppError> {
        let path = self.get_path(key)?;
        match tokio::fs::remove_file(&path).await {
            Ok(_) => Ok(()),
            Err(e) => {
                if e.to_string().contains("No such file") {
                    // It's okay if the file doesn't exist
                    Ok(())
                } else {
                    Err(AppError::Storage(format!("Failed to delete file: {}", e)))
                }
            }
        }
    }

    async fn upload_target(
        &self,
        key: &str,
        _expires_in: Duration,
    ) -> Result<UploadTarget, AppError> {
        // Validate key before returning target
        let _ = self.get_path(key)?;
        // For local storage, uploads are server-mediated
        Ok(UploadTarget::ServerMediated(format!(
            "/api/app/assets/{}/upload",
            key
        )))
    }

    async fn download_target(
        &self,
        key: &str,
        _expires_in: Duration,
    ) -> Result<DownloadTarget, AppError> {
        // Validate key before returning target
        let _ = self.get_path(key)?;
        // For local storage, downloads are server-mediated
        Ok(DownloadTarget::ServerMediated(format!(
            "/api/app/assets/{}",
            key
        )))
    }

    async fn ensure_ready(&self) -> Result<(), AppError> {
        tokio::fs::create_dir_all(&self.root_dir)
            .await
            .map_err(|e| AppError::Storage(format!("Failed to create root directory: {}", e)))?;
        Ok(())
    }

    async fn exists(&self, key: &str) -> Result<bool, AppError> {
        let path = self.get_path(key)?;
        Ok(tokio::fs::try_exists(&path)
            .await
            .map_err(|e| AppError::Storage(format!("Failed to check file existence: {}", e)))?)
    }

    async fn list(&self, prefix: &str) -> Result<Vec<String>, AppError> {
        let root_path = Path::new(&self.root_dir);
        let prefix_path = if prefix.is_empty() {
            root_path.to_path_buf()
        } else {
            let normalized = prefix.replace('\\', "/");
            let path = Path::new(&normalized);
            for component in path.components() {
                if matches!(
                    component,
                    std::path::Component::ParentDir
                        | std::path::Component::RootDir
                        | std::path::Component::Prefix(_)
                ) {
                    return Err(AppError::InvalidInput(
                        "Path traversal detected".to_string(),
                    ));
                }
            }
            root_path.join(path)
        };

        let mut keys = Vec::new();

        if prefix_path.exists() {
            let mut dir = tokio::fs::read_dir(&prefix_path)
                .await
                .map_err(|e| AppError::Storage(format!("Failed to read directory: {}", e)))?;

            while let Some(entry) = dir
                .next_entry()
                .await
                .map_err(|e| AppError::Storage(format!("Failed to read directory entry: {}", e)))?
            {
                let path = entry.path();
                let key = path
                    .strip_prefix(root_path)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");

                if entry
                    .file_type()
                    .await
                    .map_err(|e| AppError::Storage(format!("Failed to get file type: {}", e)))?
                    .is_file()
                {
                    keys.push(key);
                }
            }
        }

        Ok(keys)
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[tokio::test]
    async fn test_local_storage_put_get() {
        let dir = tempdir().unwrap();
        let storage = LocalFsStorage::new(dir.path().to_string_lossy().into_owned());

        storage.ensure_ready().await.unwrap();

        let key = "test/file.txt";
        let content = Bytes::from("Hello, World!");

        storage
            .put(key, content.clone(), "text/plain")
            .await
            .unwrap();

        let retrieved = storage.get(key).await.unwrap();
        assert_eq!(retrieved, content);
    }

    #[tokio::test]
    async fn test_local_storage_delete() {
        let dir = tempdir().unwrap();
        let storage = LocalFsStorage::new(dir.path().to_string_lossy().into_owned());

        storage.ensure_ready().await.unwrap();

        let key = "test/file.txt";
        let content = Bytes::from("Hello, World!");

        storage.put(key, content, "text/plain").await.unwrap();
        assert!(storage.exists(key).await.unwrap());

        storage.delete(key).await.unwrap();
        assert!(!storage.exists(key).await.unwrap());
    }

    #[tokio::test]
    async fn test_local_storage_list() {
        let dir = tempdir().unwrap();
        let storage = LocalFsStorage::new(dir.path().to_string_lossy().into_owned());

        storage.ensure_ready().await.unwrap();

        storage
            .put("test/file1.txt", Bytes::from("content1"), "text/plain")
            .await
            .unwrap();
        storage
            .put("test/file2.txt", Bytes::from("content2"), "text/plain")
            .await
            .unwrap();
        storage
            .put("other/file.txt", Bytes::from("content3"), "text/plain")
            .await
            .unwrap();

        let keys = storage.list("test/").await.unwrap();
        assert_eq!(keys.len(), 2);
        assert!(keys.iter().any(|k| k.contains("file1.txt")));
        assert!(keys.iter().any(|k| k.contains("file2.txt")));
    }

    #[tokio::test]
    async fn test_local_storage_upload_target() {
        let dir = tempdir().unwrap();
        let storage = LocalFsStorage::new(dir.path().to_string_lossy().into_owned());

        let target = storage
            .upload_target("test/file.txt", Duration::from_secs(3600))
            .await
            .unwrap();

        match target {
            UploadTarget::ServerMediated(url) => {
                assert!(url.contains("/api/app/assets/test/file.txt/upload"));
            }
            UploadTarget::Presigned(_) => panic!("Expected ServerMediated for local storage"),
        }
    }

    #[tokio::test]
    async fn test_local_storage_path_traversal_prevention() {
        let dir = tempdir().unwrap();
        let storage = LocalFsStorage::new(dir.path().to_string_lossy().into_owned());

        // Relative parent traversal
        assert!(storage
            .put("../evil.txt", Bytes::from("payload"), "text/plain")
            .await
            .is_err());
        assert!(storage.get("../evil.txt").await.is_err());
        assert!(storage.delete("foo/../../evil.txt").await.is_err());
        assert!(storage.exists("nested/../../../etc/passwd").await.is_err());
        assert!(storage.list("../").await.is_err());

        // Absolute path attempts
        assert!(storage
            .put("/root/file.txt", Bytes::from("payload"), "text/plain")
            .await
            .is_err());
    }
}
