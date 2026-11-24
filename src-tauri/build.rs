fn main() {
    // tauri-build only embeds its Windows manifest into the app binary, so test
    // binaries load Common Controls v5 and crash with STATUS_ENTRYPOINT_NOT_FOUND.
    // Embed our own manifest into every binary instead (app and tests).
    let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
    embed_windows_manifest();
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run tauri-build");
}

fn embed_windows_manifest() {
    let manifest = std::env::current_dir()
        .unwrap()
        .join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        // Turns linker warnings (e.g. a malformed manifest) into errors.
        println!("cargo:rustc-link-arg=/WX");
    }
}
