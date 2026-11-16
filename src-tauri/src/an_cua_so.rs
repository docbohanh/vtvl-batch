//! Ẩn cửa sổ dòng lệnh (console) khi ứng dụng Windows chạy tiến trình phụ như Node.
//! Bản phát hành đã đặt `windows_subsystem = "windows"` nên ứng dụng không còn console; nhưng tiến trình con của ứng dụng GUI vẫn tự mở một cửa sổ console nếu không đặt cờ này.
//! Hệ điều hành khác không làm gì.

/// `CREATE_NO_WINDOW` của Windows.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Đặt cờ không mở cửa sổ cho lệnh `tokio`.
pub fn tokio(cmd: &mut tokio::process::Command) -> &mut tokio::process::Command {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Đặt cờ không mở cửa sổ cho lệnh `std`.
pub fn std_cmd(cmd: &mut std::process::Command) -> &mut std::process::Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
