//! Locations of the data files.

use std::path::PathBuf;

/// Folder created in the user's Documents for the backup mirror.
pub const DOCUMENTS_FOLDER_NAME: &str = "FFXIV Achievement Tracker";
const DOCUMENTS_BACKUP_FILE: &str = "userdata-backup.json";

#[derive(Debug, Clone)]
pub struct StorePaths {
    /// App data folder (catalog, collections, user data).
    pub data_dir: PathBuf,
    /// `Documents/FFXIV Achievement Tracker`, if the Documents folder is known.
    pub documents_dir: Option<PathBuf>,
}

impl StorePaths {
    pub fn catalog(&self) -> PathBuf {
        self.data_dir.join("catalog.json")
    }

    pub fn collections(&self) -> PathBuf {
        self.data_dir.join("collections.json")
    }

    pub fn user(&self) -> PathBuf {
        self.data_dir.join("userdata.json")
    }

    pub fn documents_backup(&self) -> Option<PathBuf> {
        self.documents_dir
            .as_ref()
            .map(|dir| dir.join(DOCUMENTS_BACKUP_FILE))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_live_in_the_data_folder_and_the_mirror_in_documents() {
        let paths = StorePaths {
            data_dir: "data".into(),
            documents_dir: Some("docs".into()),
        };
        assert_eq!(paths.catalog(), PathBuf::from("data/catalog.json"));
        assert_eq!(paths.collections(), PathBuf::from("data/collections.json"));
        assert_eq!(paths.user(), PathBuf::from("data/userdata.json"));
        assert_eq!(
            paths.documents_backup(),
            Some(PathBuf::from("docs/userdata-backup.json"))
        );
    }

    #[test]
    fn no_mirror_without_a_documents_folder() {
        let paths = StorePaths {
            data_dir: "data".into(),
            documents_dir: None,
        };
        assert_eq!(paths.documents_backup(), None);
    }
}
