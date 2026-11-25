//! Gives the main window the size and position the Electron app saved, on the
//! first launch after it; the window-state plugin takes over afterwards.

use tauri::{LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};

use crate::store::electron_migration::ElectronWindowState;

/// Point of the title bar, from the window's top-left corner, that must be on a
/// screen for the saved position to be kept (physical pixels).
const TITLE_BAR_PROBE: f64 = 40.0;

/// Inner size giving the window the outer size Electron saved. The frame (title
/// bar and borders) is what the current window's outer size adds to its inner size.
pub fn inner_size_for(
    saved: &ElectronWindowState,
    outer: PhysicalSize<u32>,
    inner: PhysicalSize<u32>,
    scale: f64,
) -> LogicalSize<f64> {
    let frame = |outer: u32, inner: u32| f64::from(outer.saturating_sub(inner)) / scale;
    LogicalSize::new(
        (saved.width - frame(outer.width, inner.width)).max(1.0),
        (saved.height - frame(outer.height, inner.height)).max(1.0),
    )
}

/// Applies the saved bounds; the position only when it is on a connected screen.
pub fn restore_electron_bounds<R: Runtime>(
    window: &WebviewWindow<R>,
    saved: &ElectronWindowState,
) -> tauri::Result<()> {
    let scale = window.scale_factor()?;
    window.set_size(inner_size_for(
        saved,
        window.outer_size()?,
        window.inner_size()?,
        scale,
    ))?;
    if let (Some(x), Some(y)) = (saved.x, saved.y) {
        let position = LogicalPosition::new(x, y);
        let corner: PhysicalPosition<f64> = position.to_physical(scale);
        // A screen unplugged since would leave the window out of sight.
        let on_screen = window
            .monitor_from_point(corner.x + TITLE_BAR_PROBE, corner.y + TITLE_BAR_PROBE)?
            .is_some();
        if on_screen {
            window.set_position(position)?;
        }
    }
    if saved.maximized {
        window.maximize()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use tauri::test::mock_app;

    use super::*;
    use crate::platform::window::create_main_window;

    fn saved(width: f64, height: f64) -> ElectronWindowState {
        ElectronWindowState {
            width,
            height,
            x: Some(640.0),
            y: Some(190.0),
            maximized: true,
        }
    }

    fn size(width: u32, height: u32) -> PhysicalSize<u32> {
        PhysicalSize::new(width, height)
    }

    #[test]
    fn removes_the_frame_from_the_saved_outer_size() {
        let inner = inner_size_for(&saved(1280.0, 868.0), size(1416, 939), size(1400, 900), 1.0);
        assert_eq!(inner, LogicalSize::new(1264.0, 829.0));
    }

    #[test]
    fn measures_the_frame_in_logical_pixels() {
        let inner = inner_size_for(
            &saved(1280.0, 868.0),
            size(2124, 1409),
            size(2100, 1350),
            1.5,
        );
        assert_eq!(inner, LogicalSize::new(1264.0, 868.0 - 59.0 / 1.5));
    }

    #[test]
    fn never_shrinks_the_window_to_nothing() {
        let inner = inner_size_for(&saved(10.0, 20.0), size(1416, 939), size(1400, 900), 1.0);
        assert_eq!(inner, LogicalSize::new(1.0, 1.0));
    }

    #[test]
    fn ignores_an_outer_size_smaller_than_the_inner_size() {
        let inner = inner_size_for(&saved(1280.0, 868.0), size(0, 0), size(1400, 900), 1.0);
        assert_eq!(inner, LogicalSize::new(1280.0, 868.0));
    }

    #[test]
    fn restores_the_bounds_on_a_window() {
        let app = mock_app();
        let window = create_main_window(app.handle(), None).unwrap();
        assert!(restore_electron_bounds(&window, &saved(1280.0, 868.0)).is_ok());
    }
}
