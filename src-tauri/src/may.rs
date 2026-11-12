//! Định danh máy đang chạy (tên máy, địa chỉ MAC, IP nội bộ) để ghi vào nhật ký các thao tác không hoàn tác được, phục vụ xác minh về sau.
//! Chỉ ghi vào nhật ký cục bộ `nhat-ky.jsonl` của đơn vị; không gửi đi đâu.

use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct DinhDanhMay {
    #[serde(rename = "tenMay")]
    pub ten_may: String,
    pub mac: String,
    pub ip: String,
}

fn chay(lenh: &str, doi_so: &[&str]) -> Option<String> {
    let r = Command::new(lenh).args(doi_so).output().ok()?;
    r.status.success().then(|| String::from_utf8_lossy(&r.stdout).into_owned())
}

/// Chuẩn hóa MAC về dạng `aa:bb:cc:dd:ee:ff`; bỏ địa chỉ rỗng hoặc toàn 0.
pub fn chuan_mac(s: &str) -> Option<String> {
    let hex: String = s.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if hex.len() != 12 || hex.chars().all(|c| c == '0') { return None; }
    let h = hex.to_ascii_lowercase();
    Some((0..6).map(|i| &h[i * 2..i * 2 + 2]).collect::<Vec<_>>().join(":"))
}

/// macOS: lấy dòng `ether` của kết quả `ifconfig <giao diện>`.
pub fn mac_tu_ifconfig(ra: &str) -> Option<String> {
    ra.lines().find_map(|l| l.trim().strip_prefix("ether ").and_then(|v| chuan_mac(v.split_whitespace().next()?)))
}

/// Windows: kết quả `getmac /fo csv /nh`, mỗi dòng `"AA-BB-…","\Device\…"`; bỏ dòng ngắt kết nối.
pub fn mac_tu_getmac(ra: &str) -> Option<String> {
    ra.lines().filter(|l| !l.contains("disconnected") && !l.contains("Media disconnected"))
        .find_map(|l| chuan_mac(l.trim().trim_start_matches('"').split('"').next()?))
}

fn mac_may() -> String {
    #[cfg(target_os = "macos")]
    { for gd in ["en0", "en1"] { if let Some(m) = chay("ifconfig", &[gd]).and_then(|r| mac_tu_ifconfig(&r)) { return m; } } }
    #[cfg(target_os = "windows")]
    { if let Some(m) = chay("getmac", &["/fo", "csv", "/nh"]).and_then(|r| mac_tu_getmac(&r)) { return m; } }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Ok(rd) = std::fs::read_dir("/sys/class/net") {
            let mut ten: Vec<_> = rd.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n != "lo").collect();
            ten.sort();
            for n in ten { if let Some(m) = std::fs::read_to_string(format!("/sys/class/net/{n}/address")).ok().and_then(|s| chuan_mac(s.trim())) { return m; } }
        }
    }
    String::new()
}

/// IP nội bộ của giao diện ra mạng chính. UDP `connect` không gửi gói nào, chỉ để hệ điều hành chọn giao diện.
fn ip_may() -> String {
    std::net::UdpSocket::bind("0.0.0.0:0").and_then(|s| { s.connect("192.0.2.1:9")?; s.local_addr() })
        .map(|a| a.ip().to_string()).unwrap_or_default()
}

fn ten_may() -> String {
    std::env::var("COMPUTERNAME").ok().filter(|s| !s.is_empty())
        .or_else(|| chay("hostname", &[]).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or_default()
}

/// Đọc định danh máy (trường nào không đọc được thì để trống, không làm hỏng thao tác chính).
pub fn doc() -> DinhDanhMay {
    DinhDanhMay { ten_may: ten_may(), mac: mac_may(), ip: ip_may() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chuan_mac_nhan_cac_dang_va_loai_dia_chi_rong() {
        assert_eq!(chuan_mac("AA-BB-CC-DD-EE-0F").as_deref(), Some("aa:bb:cc:dd:ee:0f"));
        assert_eq!(chuan_mac("aa:bb:cc:dd:ee:0f").as_deref(), Some("aa:bb:cc:dd:ee:0f"));
        assert_eq!(chuan_mac("00:00:00:00:00:00"), None);
        assert_eq!(chuan_mac("abc"), None);
    }

    #[test]
    fn doc_mac_tu_ifconfig_va_getmac() {
        assert_eq!(mac_tu_ifconfig("en0: flags=8863\n\tether 3c:22:fb:01:02:03 \n\tinet 10.0.0.5").as_deref(), Some("3c:22:fb:01:02:03"));
        assert_eq!(mac_tu_ifconfig("lo0: flags\n\tinet 127.0.0.1"), None);
        let ra = "\"N/A\",\"Media disconnected\"\n\"A4-BB-6D-11-22-33\",\"\\Device\\Tcpip_{X}\"\n";
        assert_eq!(mac_tu_getmac(ra).as_deref(), Some("a4:bb:6d:11:22:33"));
    }
}
