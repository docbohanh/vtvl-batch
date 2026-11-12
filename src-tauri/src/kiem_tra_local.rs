//! Kiểm tra tệp Excel trên máy bằng tiến trình phụ Node (`scripts/kiem-tra/cli.mjs kiem-tra-local`).
//! Thư mục `scripts/kiem-tra/` là bản chép của phần kiểm tra trong vtvl_app (tự đủ, không phụ thuộc vtvl_app); quy tắc không port sang Rust.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DongTho {
    #[serde(rename = "rowNo")]
    pub row_no: u32,
    pub data: BTreeMap<String, Option<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)] // đủ trường của JSON để giao diện/báo cáo dùng sau
pub struct LoiO {
    pub sheet: String,
    #[serde(default)]
    pub bieu: Option<String>,
    pub dong: Option<u32>,
    pub o: String,
    pub ma: String,
    pub muc: String,
    pub noi_dung: String,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct KetQuaKiemTra {
    pub tong_dong: u64,
    pub dong_loi: u64,
    pub dong_hop_le: u64,
    #[serde(default)]
    pub loi: Vec<LoiO>,
    #[serde(default)]
    pub canh_bao: Vec<String>,
    #[serde(default)]
    pub dong: BTreeMap<String, Vec<DongTho>>,
    #[serde(default)]
    pub cot_nhap: BTreeMap<String, Vec<String>>,
    /// Định nghĩa đủ cột của từng biểu có trong tệp (chỉ khi gọi với `--co-dong`).
    #[serde(default)]
    pub cot: BTreeMap<String, Vec<CotTho>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CotTho {
    pub letter: String,
    pub title: String,
    pub kind: String,
    #[serde(rename = "type")]
    pub kieu: String,
}

impl KetQuaKiemTra {
    /// Số mục "cần xem lại" (không chặn).
    pub fn so_canh_bao(&self) -> u64 {
        self.loi.iter().filter(|e| e.muc != "loi").count() as u64
    }

    /// Dòng còn lỗi phải sửa: (khóa biểu, số dòng Excel). Các dòng này không đưa vào gói.
    pub fn dong_loi_chan(&self) -> std::collections::HashSet<(String, u32)> {
        self.loi.iter().filter(|e| e.muc == "loi").filter_map(|e| Some((e.bieu.clone()?, e.dong?))).collect()
    }
}

pub struct YeuCau<'a> {
    pub node: &'a str,
    /// Tập lệnh `cli.mjs` (đường dẫn đã tính xong, tuyệt đối hoặc đúng so với thư mục chạy).
    pub script: &'a Path,
    pub excel: &'a Path,
    /// `workbook` hoặc `single`.
    pub mode: &'a str,
    pub form_key: Option<&'a str>,
    pub ky: Option<&'a str>,
    pub danh_muc: Option<&'a Path>,
    pub timeout: Duration,
}

/// Tham số dòng lệnh (hàm thuần để kiểm thử).
pub fn tham_so(y: &YeuCau) -> Vec<String> {
    let mut a = vec![y.script.to_string_lossy().into_owned(), "kiem-tra-local".into(), y.excel.to_string_lossy().into_owned()];
    a.push(if y.mode == "single" { "--kieu=single".into() } else { "--kieu=full".into() });
    if let Some(f) = y.form_key.filter(|f| !f.is_empty()) {
        a.push(format!("--form={f}"));
    }
    if let Some(k) = y.ky.filter(|k| !k.is_empty()) {
        a.push(format!("--ky={k}"));
    }
    if let Some(d) = y.danh_muc {
        a.push(format!("--danh-muc={}", d.display()));
    }
    a.push("--co-dong".into());
    a
}

/// Số phiên bản dạng `v22.21.1` → (22, 21, 1); tên không đúng dạng thì None.
fn so_phien_ban(ten: &str) -> Option<(u32, u32, u32)> {
    let mut p = ten.strip_prefix('v')?.split('.').map(|x| x.parse::<u32>());
    Some((p.next()?.ok()?, p.next()?.ok()?, p.next()?.ok()?))
}

/// Các thư mục thường cài Node nhưng hay không có trong PATH của ứng dụng mở từ Finder/menu Start.
fn thu_muc_node_pho_bien() -> Vec<PathBuf> {
    let mut ra: Vec<PathBuf> = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin"].iter().map(PathBuf::from).collect();
    let nha = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from);
    if let Some(nha) = nha {
        ra.push(nha.join(".volta").join("bin"));
        // nvm: phiên bản cao nhất trước
        if let Ok(rd) = std::fs::read_dir(nha.join(".nvm").join("versions").join("node")) {
            let mut v: Vec<_> = rd.flatten().filter_map(|e| so_phien_ban(&e.file_name().to_string_lossy()).map(|k| (k, e.path()))).collect();
            v.sort_by(|a, b| b.0.cmp(&a.0));
            ra.extend(v.into_iter().map(|(_, d)| d.join("bin")));
        }
    }
    for bien in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(d) = std::env::var_os(bien) { ra.push(PathBuf::from(d).join("nodejs")); }
    }
    if let Some(d) = std::env::var_os("LOCALAPPDATA") { ra.push(PathBuf::from(d).join("Programs").join("nodejs")); }
    ra
}

/// Tìm tệp chạy Node theo thứ tự: tên có dấu `/` hoặc `\` (đường dẫn) dùng nguyên; không thì dò PATH rồi các nơi cài phổ biến.
/// Không thấy thì trả lại đúng tên đã cho để lỗi báo rõ.
pub fn tim_node(ten: &str) -> String {
    tim_node_trong(ten, &std::env::var_os("PATH").unwrap_or_default(), &thu_muc_node_pho_bien())
}

fn tim_node_trong(ten: &str, duong_path: &OsStr, them: &[PathBuf]) -> String {
    if ten.contains('/') || ten.contains('\\') {
        return ten.to_string();
    }
    let ten_exe = format!("{ten}.exe");
    std::env::split_paths(duong_path).chain(them.iter().cloned())
        .flat_map(|d| [d.join(ten), d.join(&ten_exe)])
        .find(|f| f.is_file())
        .map(|f| f.to_string_lossy().into_owned())
        .unwrap_or_else(|| ten.to_string())
}

/// Trả kết quả có kiểu và bản JSON gốc (để lưu `kiem-tra/<runId>.json`).
pub async fn chay(y: &YeuCau<'_>) -> Result<(KetQuaKiemTra, serde_json::Value), String> {
    if !y.script.is_file() {
        return Err(format!("Không thấy tập lệnh kiểm tra tệp: {}. Kiểm tra kiemTraScript trong cấu hình lô.", y.script.display()));
    }
    let node = tim_node(y.node);
    let mut cmd = Command::new(&node);
    cmd.args(tham_so(y)).kill_on_drop(true).stdin(std::process::Stdio::null());
    let out = tokio::time::timeout(y.timeout, cmd.output())
        .await
        .map_err(|_| format!("Kiểm tra tệp quá {} giây", y.timeout.as_secs()))?
        .map_err(|e| format!("Không chạy được Node ({node}): {e}. Cài Node.js 20 trở lên hoặc đặt đường dẫn đầy đủ vào `settings.node` trong cấu hình lô."))?;
    if !out.status.success() {
        return Err(loi_tu_stderr(&String::from_utf8_lossy(&out.stderr)));
    }
    doc_ket_qua(&String::from_utf8_lossy(&out.stdout))
}

/// Chọn dòng dễ hiểu nhất từ stderr của Node: dòng `Lỗi:` do tập lệnh in, rồi dòng `Error:`/`Cannot find module`, không thì dòng cuối.
/// (Dòng đầu của dấu vết Node thường chỉ là `node:internal/...`, vô nghĩa với người dùng.)
pub fn loi_tu_stderr(err: &str) -> String {
    let dong: Vec<&str> = err.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let tot = dong.iter().find(|l| l.starts_with("Lỗi:")).or_else(|| dong.iter().find(|l| l.contains("Cannot find module") || l.contains("Error:") || l.contains("ERR_")));
    let chon = tot.copied().or_else(|| dong.last().copied()).unwrap_or("Kiểm tra tệp thất bại");
    let goc = chon.trim_start_matches("Lỗi: ");
    if goc.contains("Cannot find package") || goc.contains("Cannot find module") {
        format!("{goc}. Chạy `npm install` trong thư mục vtvl-batch để cài thư viện (exceljs).")
    } else {
        goc.to_string()
    }
}

pub fn doc_ket_qua(stdout: &str) -> Result<(KetQuaKiemTra, serde_json::Value), String> {
    let line = stdout.lines().rev().find(|l| l.trim_start().starts_with('{')).ok_or("Tiến trình kiểm tra không trả JSON")?;
    let tho: serde_json::Value = serde_json::from_str(line).map_err(|e| format!("Kết quả kiểm tra không phải JSON: {e}"))?;
    let kq = serde_json::from_value(tho.clone()).map_err(|e| format!("Kết quả kiểm tra không đúng định dạng: {e}"))?;
    Ok((kq, tho))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arguments_follow_cli_contract() {
        let p = Path::new("/x/a.xlsx");
        let y = YeuCau { node: "node", script: Path::new("scripts/kiem-tra/cli.mjs"), excel: p, mode: "single", form_key: Some("a1"), ky: Some("01/10/2025 – 30/09/2026"), danh_muc: None, timeout: Duration::from_secs(1) };
        let a = tham_so(&y);
        assert!(a[0].ends_with("cli.mjs") && a[1] == "kiem-tra-local");
        assert!(a.contains(&"--kieu=single".into()) && a.contains(&"--form=a1".into()) && a.contains(&"--co-dong".into()));
        assert!(a.iter().any(|s| s.starts_with("--ky=01/10/2025")));
        let full = YeuCau { mode: "workbook", form_key: None, ky: None, ..y };
        assert!(tham_so(&full).contains(&"--kieu=full".into()));
    }

    #[test]
    fn result_is_parsed_and_blocking_rows_extracted() {
        let out = r#"cảnh báo thừa
{"tong_dong":3,"dong_loi":1,"dong_hop_le":2,"loi":[{"sheet":"1. A1","bieu":"a1","dong":4,"o":"F4","ma":"VAL-008","muc":"loi","noi_dung":"x"},{"sheet":"1. A1","bieu":"a1","dong":5,"o":"D5","ma":"VAL-007","muc":"xem_lai","noi_dung":"y"},{"sheet":"Cả tệp","dong":null,"o":"","ma":"IMP-SHEET","muc":"loi","noi_dung":"z"}],"canh_bao":[],"dong":{"a1":[{"rowNo":3,"data":{"A":"NV-1","B":null}}]},"cot_nhap":{"a1":["A","B"]}}"#;
        let (r, tho) = doc_ket_qua(out).unwrap();
        assert_eq!(tho["tong_dong"], 3);
        assert_eq!((r.tong_dong, r.dong_loi, r.so_canh_bao()), (3, 1, 1));
        assert_eq!(r.dong_loi_chan().into_iter().collect::<Vec<_>>(), vec![("a1".to_string(), 4)]);
        assert_eq!(r.dong["a1"][0].data["A"].as_deref(), Some("NV-1"));
        assert!(doc_ket_qua("không có json").is_err());
    }

    #[test]
    fn so_phien_ban_doc_dung_dang_vx_y_z() {
        assert_eq!(so_phien_ban("v22.21.1"), Some((22, 21, 1)));
        assert_eq!(so_phien_ban("v8.9.0") < so_phien_ban("v20.0.0"), true, "so sánh theo số, không theo chữ");
        for sai in ["22.21.1", "v22", "latest", "v1.x.2"] { assert_eq!(so_phien_ban(sai), None, "{sai}"); }
    }

    #[test]
    fn tim_node_do_path_roi_cac_noi_cai_pho_bien() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a"), dir.path().join("b"));
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        let tep = if cfg!(windows) { "node.exe" } else { "node" };
        std::fs::write(b.join(tep), "").unwrap();
        // chỉ có ở thư mục phổ biến (không có trong PATH): vẫn tìm được, như khi mở app từ Finder
        let thay = tim_node_trong("node", a.as_os_str(), &[b.clone()]);
        assert_eq!(PathBuf::from(&thay), b.join(tep));
        // có trong PATH thì ưu tiên PATH
        std::fs::write(a.join(tep), "").unwrap();
        assert_eq!(PathBuf::from(tim_node_trong("node", a.as_os_str(), &[b.clone()])), a.join(tep));
        // đường dẫn tường minh giữ nguyên; không thấy ở đâu thì trả lại tên
        assert_eq!(tim_node_trong("/opt/x/node", a.as_os_str(), &[b.clone()]), "/opt/x/node");
        assert_eq!(tim_node_trong("khong-co-node", a.as_os_str(), &[b]), "khong-co-node");
    }

    #[tokio::test]
    async fn missing_node_gives_actionable_error() {
        let p = Path::new("/x/a.xlsx");
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("cli.mjs");
        std::fs::write(&f, "").unwrap();
        let y = YeuCau { node: "/khong/co/node", script: &f, excel: p, mode: "workbook", form_key: None, ky: None, danh_muc: None, timeout: Duration::from_secs(2) };
        assert!(chay(&y).await.unwrap_err().contains("Không chạy được Node"));
        let khong = YeuCau { script: Path::new("/khong/co/cli.mjs"), ..y };
        assert!(chay(&khong).await.unwrap_err().contains("Không thấy tập lệnh kiểm tra tệp"));
    }

    #[test]
    fn node_stderr_is_reduced_to_the_meaningful_line() {
        let trace = "node:internal/modules/cjs/loader:1424\n  throw err;\n  ^\n\nError: Cannot find module '/x/cli.mjs'\n    at Function._resolveFilename";
        assert!(loi_tu_stderr(trace).starts_with("Error: Cannot find module '/x/cli.mjs'"));
        assert!(loi_tu_stderr("Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'exceljs'").contains("npm install"));
        assert_eq!(loi_tu_stderr("Lỗi: Không đọc được a.xlsx"), "Không đọc được a.xlsx");
        assert_eq!(loi_tu_stderr(""), "Kiểm tra tệp thất bại");
    }
}
