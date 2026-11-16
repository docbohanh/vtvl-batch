//! Báo cáo thẩm định theo skill `vtvl-tham-dinh`: chạy lõi thẩm định (TD) của công cụ web ngay trên máy (tiến trình phụ Node `scripts/tham-dinh/tham_dinh.mjs`)
//! rồi đọc kết luận A/B/C/D, phiếu 12 nội dung, 18 chỉ số và danh sách mã lỗi kèm biểu/cột/dòng. Chỉ đọc tệp trên máy, không gọi cổng, không ghi gì vào dữ liệu đơn vị.

use crate::{lay_lo, AppState};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::State;
use tokio::process::Command;

const SCRIPT: &str = "scripts/tham-dinh/tham_dinh.mjs";
/// Lần đầu script tải công cụ (khoảng 2,4 MB) nên cho thời gian rộng hơn kiểm tra thường.
const HAN_CHO: Duration = Duration::from_secs(180);

#[derive(Debug, Serialize, PartialEq)]
pub struct Phieu {
    pub tt: u64,
    #[serde(rename = "noiDung")]
    pub noi_dung: String,
    #[serde(rename = "ketQua")]
    pub ket_qua: String,
    pub bb: u64,
    pub cb: u64,
    #[serde(rename = "yeuCau")]
    pub yeu_cau: String,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ChiSo {
    pub so: u64,
    pub ten: String,
    pub tu: Option<f64>,
    pub mau: Option<f64>,
    #[serde(rename = "tuTen")]
    pub tu_ten: String,
    #[serde(rename = "mauTen")]
    pub mau_ten: String,
    #[serde(rename = "giaTri")]
    pub gia_tri: String,
    #[serde(rename = "danhGia")]
    pub danh_gia: String,
    pub nguong: String,
}

/// Một phát hiện cụ thể: nằm ở biểu/cột/dòng nào, giá trị gì.
#[derive(Debug, Serialize, PartialEq)]
pub struct Muc {
    pub bieu: String,
    pub cot: String,
    /// Số dòng, hoặc khoảng ("3–12") khi cổng gộp nhiều dòng.
    pub dong: String,
    pub ma: String,
    #[serde(rename = "giaTri")]
    pub gia_tri: String,
    #[serde(rename = "moTa")]
    pub mo_ta: String,
    #[serde(rename = "deNghi")]
    pub de_nghi: String,
    #[serde(rename = "canCu")]
    pub can_cu: String,
}

/// Nhóm theo mã lỗi (HS, KT, LK, A1xx…D2xx, NV11): `muc` là BB (chặn), CB (cần giải trình) hoặc TK (tham khảo).
#[derive(Debug, Serialize, PartialEq)]
pub struct Nhom {
    pub id: String,
    pub muc: String,
    #[serde(rename = "soLuong")]
    pub so_luong: u64,
    pub ten: String,
    #[serde(rename = "chiTiet")]
    pub chi_tiet: Vec<Muc>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct BaoCao {
    #[serde(rename = "phienBan")]
    pub phien_ban: String,
    /// A, B, C hoặc D.
    #[serde(rename = "ketLuan")]
    pub ket_luan: String,
    #[serde(rename = "lyDo")]
    pub ly_do: Vec<String>,
    pub phieu: Vec<Phieu>,
    #[serde(rename = "chiSo")]
    pub chi_so: Vec<ChiSo>,
    pub nhom: Vec<Nhom>,
}

fn chuoi(v: &Value, k: &str) -> String {
    match &v[k] { Value::String(s) => s.clone(), Value::Null => String::new(), x => x.to_string() }
}
fn so(v: &Value, k: &str) -> u64 { v[k].as_u64().unwrap_or(0) }

/// Thứ tự mức khi hiển thị: chặn trước, rồi cần giải trình, rồi tham khảo.
fn thu_tu_muc(m: &str) -> u8 { match m { "BB" => 0, "CB" => 1, _ => 2 } }

/// Đọc tệp JSON do `tham_dinh.mjs --json` ghi ra. Thuần.
pub fn doc_bao_cao(json: &str) -> Result<BaoCao, String> {
    let v: Value = serde_json::from_str(json).map_err(|_| "Kết quả thẩm định không đọc được (không phải JSON)".to_string())?;
    let ket_luan = chuoi(&v, "level");
    if ket_luan.is_empty() { return Err("Kết quả thẩm định thiếu kết luận".into()); }
    let mut nhom: Vec<Nhom> = v["groups"].as_array().into_iter().flatten().map(|g| Nhom {
        id: chuoi(g, "id"), muc: chuoi(g, "muc"), so_luong: so(g, "n"), ten: chuoi(g, "ten"),
        chi_tiet: g["items"].as_array().into_iter().flatten().map(|m| Muc {
            bieu: chuoi(m, "bieu"), cot: chuoi(m, "cot"), dong: chuoi(m, "dong"), ma: chuoi(m, "ma"), gia_tri: chuoi(m, "giatri"),
            mo_ta: chuoi(m, "mota"), de_nghi: chuoi(m, "denghi"), can_cu: chuoi(m, "cancu"),
        }).collect(),
    }).collect();
    nhom.sort_by(|a, b| thu_tu_muc(&a.muc).cmp(&thu_tu_muc(&b.muc)).then_with(|| a.id.cmp(&b.id)));
    Ok(BaoCao {
        phien_ban: chuoi(&v, "version"), ket_luan,
        ly_do: v["reasons"].as_array().into_iter().flatten().filter_map(|r| r.as_str().map(str::to_string)).collect(),
        phieu: v["phieu"].as_array().into_iter().flatten().map(|p| Phieu { tt: so(p, "tt"), noi_dung: chuoi(p, "nd"), ket_qua: chuoi(p, "kq"), bb: so(p, "bb"), cb: so(p, "cb"), yeu_cau: chuoi(p, "yc") }).collect(),
        chi_so: v["indicators"].as_array().into_iter().flatten().map(|x| ChiSo {
            so: so(x, "so"), ten: chuoi(x, "ten"), tu: x["tu"].as_f64(), mau: x["mau"].as_f64(), tu_ten: chuoi(x, "tuTen"), mau_ten: chuoi(x, "mauTen"),
            gia_tri: chuoi(x, "gt"), danh_gia: chuoi(x, "danhgia"), nguong: chuoi(x, "nguong"),
        }).collect(),
        nhom,
    })
}

/// Đối số dòng lệnh của `tham_dinh.mjs`.
pub fn tham_so(script: &Path, excel: &Path, don_vi: &str, xac_nhan: bool, ra: &Path) -> Vec<String> {
    let mut a = vec![script.to_string_lossy().into_owned(), excel.to_string_lossy().into_owned(), "--don-vi".into(), don_vi.into(), "--chi-tiet".into(), "1000".into()];
    if xac_nhan { a.push("--xac-nhan".into()); }
    a.push("--json".into());
    a.push(ra.to_string_lossy().into_owned());
    a
}

/// Gợi ý cho lỗi hay gặp khi script chưa có công cụ trong bộ nhớ đệm và không có mạng.
fn goi_y_loi(stderr: &str) -> String {
    let dong = crate::kiem_tra_local::loi_tu_stderr(stderr);
    let l = stderr.to_lowercase();
    if ["enotfound", "eai_again", "econnrefused", "etimedout", "http 4", "http 5", "getaddrinfo"].iter().any(|k| l.contains(k)) {
        format!("{dong}. Lần đầu cần có mạng để tải công cụ thẩm định (về sau dùng bản đã tải).")
    } else { dong }
}

/// Chạy thẩm định trên một tệp .xlsx.
pub async fn chay(node: &str, script: &Path, excel: &Path, don_vi: &str, xac_nhan: bool) -> Result<BaoCao, String> {
    if !script.is_file() {
        return Err(format!("Không thấy tập lệnh thẩm định: {}. Cần bản cài có thư mục scripts/tham-dinh.", script.display()));
    }
    let ra: PathBuf = std::env::temp_dir().join(format!("vtvl-tham-dinh-{}-{}.json", std::process::id(), chrono::Utc::now().timestamp_millis()));
    let node = crate::kiem_tra_local::tim_node(node);
    let mut lenh = Command::new(&node);
    lenh.args(tham_so(script, excel, don_vi, xac_nhan, &ra)).kill_on_drop(true).stdin(std::process::Stdio::null());
    crate::an_cua_so::tokio(&mut lenh);
    let kq = tokio::time::timeout(HAN_CHO, lenh.output()).await;
    let doc = || std::fs::read_to_string(&ra);
    let ket_qua = match kq {
        Err(_) => Err(format!("Thẩm định quá {} giây", HAN_CHO.as_secs())),
        Ok(Err(e)) => Err(format!("Không chạy được Node ({node}): {e}. Cài Node.js 20 trở lên hoặc đặt đường dẫn đầy đủ vào `settings.node` trong cấu hình lô.")),
        Ok(Ok(out)) if !out.status.success() => Err(format!("Thẩm định thất bại: {}", goi_y_loi(&String::from_utf8_lossy(&out.stderr)))),
        Ok(Ok(_)) => doc().map_err(|e| format!("Không đọc được kết quả thẩm định: {e}")).and_then(|t| doc_bao_cao(&t)),
    };
    let _ = std::fs::remove_file(&ra);
    ket_qua
}

/// Báo cáo thẩm định theo mã lỗi của một tệp Excel (`.xlsx`, hoặc `.xls` được đổi sang `.xlsx` tạm). `xac_nhan`: hồ sơ đã có xác nhận người đứng đầu (mã HS02).
#[tauri::command]
pub async fn tham_dinh_bao_cao(duong_dan: String, xac_nhan: bool, state: State<'_, AppState>) -> Result<BaoCao, String> {
    let (excel, _) = crate::tham_dinh::kiem_tra_tep(&duong_dan)?;
    let lo = lay_lo(&state)?;
    let s = &lo.cfg.settings;
    let script = crate::lo::giai_duong_script(&lo.goc, SCRIPT);
    let ten = excel.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if crate::chuyen_xls::la_xls(&excel) {
        let tam = std::env::temp_dir().join(format!("vtvl-batch-td-{}-{}.xlsx", std::process::id(), chrono::Local::now().timestamp_millis()));
        crate::chuyen_xls::xls_sang_xlsx(&excel, &tam)?;
        let kq = chay(&s.node, &script, &tam, &ten, xac_nhan).await;
        let _ = std::fs::remove_file(&tam);
        return kq;
    }
    chay(&s.node, &script, &excel, &ten, xac_nhan).await
}

/// Ghi tệp DOCX do giao diện dựng (byte) ra đường dẫn người dùng đã chọn; ép đuôi .docx.
#[tauri::command]
pub fn ghi_tep_docx(duong_dan: String, noi_dung: Vec<u8>) -> Result<String, String> {
    let dich = duong_dich_docx(&duong_dan, &noi_dung)?;
    std::fs::write(&dich, &noi_dung).map_err(|e| format!("Không ghi được tệp: {e}"))?;
    Ok(dich.to_string_lossy().into_owned())
}

/// Kiểm tra đầu vào của `ghi_tep_docx`: có đường dẫn, đúng chữ ký ZIP ("PK"), đuôi .docx.
pub fn duong_dich_docx(duong_dan: &str, noi_dung: &[u8]) -> Result<std::path::PathBuf, String> {
    let mut dich = std::path::PathBuf::from(duong_dan.trim());
    if dich.as_os_str().is_empty() { return Err("Chưa chọn nơi lưu tệp".into()); }
    if !noi_dung.starts_with(b"PK") { return Err("Nội dung không phải tệp DOCX hợp lệ".into()); }
    if dich.extension().is_none_or(|x| !x.eq_ignore_ascii_case("docx")) { dich.set_extension("docx"); }
    Ok(dich)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAU: &str = r#"{"version":"3.0 (12/11/2026)","level":"D","reasons":["Thuộc trường hợp trả lại: ghi đè công thức (KT02: 7 nhóm ô)."],
      "phieu":[{"tt":1,"nd":"Hồ sơ, thể thức","kq":"Đạt – có cảnh báo","bb":0,"cb":1,"yc":"HS04"}],
      "indicators":[{"so":1,"ten":"Tỷ lệ VTVL đủ căn cứ","tu":16,"mau":16,"tuTen":"VTVL đạt ở C3","mauTen":"Số VTVL ở C1","gt":"100%","v":1,"danhgia":"Tốt","nguong":"≥ 90% tốt"},
                    {"so":15,"ten":"Chỉ số khác","tu":null,"mau":null,"gt":"—","danhgia":"Mức 3","nguong":""}],
      "groups":[{"id":"HS01","muc":"TK","n":1,"ten":"Thiếu sheet","items":[{"bieu":"11. DM","cot":"","dong":"","mota":"Thiếu biểu"}]},
                {"id":"KT02","muc":"BB","n":7,"ten":"Ô tự tính bị ghi đè","items":[{"id":"KT02","muc":"BB","bieu":"B2_CT","cot":"B","dong":"3–12","giatri":"10/10 ô","mota":"đã tự tính lại","denghi":"Xóa số nhập tay","cancu":"Mục III.2"},{"bieu":"C3","cot":"D","dong":5,"mota":"x"}]},
                {"id":"HS04","muc":"CB","n":1,"ten":"Thiếu đầu mối","items":[]}]}"#;

    #[test]
    fn ghi_docx_ep_duoi_va_chan_noi_dung_sai() {
        assert_eq!(duong_dich_docx("/tmp/a", b"PK\x03\x04").unwrap().to_string_lossy(), "/tmp/a.docx");
        assert_eq!(duong_dich_docx("/tmp/a.DOCX", b"PK").unwrap().to_string_lossy(), "/tmp/a.DOCX");
        assert!(duong_dich_docx("  ", b"PK").is_err());
        assert!(duong_dich_docx("/tmp/a.docx", b"<html>").is_err());
    }

    #[test]
    fn doc_ket_luan_phieu_chi_so() {
        let b = doc_bao_cao(MAU).unwrap();
        assert_eq!(b.ket_luan, "D");
        assert!(b.phien_ban.starts_with("3.0"));
        assert_eq!(b.ly_do.len(), 1);
        assert_eq!((b.phieu[0].tt, b.phieu[0].cb, b.phieu[0].noi_dung.as_str()), (1, 1, "Hồ sơ, thể thức"));
        assert_eq!((b.chi_so[0].gia_tri.as_str(), b.chi_so[0].tu, b.chi_so[0].mau), ("100%", Some(16.0), Some(16.0)));
        assert_eq!(b.chi_so[1].tu, None, "chỉ số không có số liệu để xét");
    }

    #[test]
    fn nhom_xep_chan_truoc_roi_giai_trinh_roi_tham_khao_va_giu_vi_tri_dong() {
        let b = doc_bao_cao(MAU).unwrap();
        assert_eq!(b.nhom.iter().map(|g| g.id.as_str()).collect::<Vec<_>>(), ["KT02", "HS04", "HS01"]);
        let kt = &b.nhom[0];
        assert_eq!(kt.so_luong, 7);
        assert_eq!((kt.chi_tiet[0].bieu.as_str(), kt.chi_tiet[0].cot.as_str(), kt.chi_tiet[0].dong.as_str()), ("B2_CT", "B", "3–12"));
        assert_eq!(kt.chi_tiet[0].gia_tri, "10/10 ô");
        assert_eq!(kt.chi_tiet[1].dong, "5", "số dòng dạng số vẫn đọc được");
        assert_eq!(kt.chi_tiet[0].de_nghi, "Xóa số nhập tay");
    }

    #[test]
    fn json_hong_hoac_thieu_ket_luan_bao_loi() {
        assert!(doc_bao_cao("không phải json").is_err());
        assert!(doc_bao_cao(r#"{"groups":[]}"#).unwrap_err().contains("kết luận"));
    }

    #[test]
    fn tham_so_co_xac_nhan_khi_duoc_chon() {
        let (s, e, r) = (Path::new("/a/t.mjs"), Path::new("/b/x.xlsx"), Path::new("/c/r.json"));
        let co = tham_so(s, e, "Đơn vị A", true, r);
        assert!(co.contains(&"--xac-nhan".to_string()) && co.contains(&"--json".to_string()));
        assert_eq!(co[1], "/b/x.xlsx");
        assert!(!tham_so(s, e, "Đơn vị A", false, r).contains(&"--xac-nhan".to_string()));
    }

    #[test]
    fn goi_y_neu_loi_mang_lan_dau() {
        assert!(goi_y_loi("Error: getaddrinfo ENOTFOUND vbai.tracuu.lamdong.vn").contains("cần có mạng"));
        assert!(!goi_y_loi("Error: Cannot find module").contains("cần có mạng"));
    }

    /// Thử thật với tập lệnh và công cụ đã tải: `VTVL_TEST_XLSX=<tệp> cargo test chay_that -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "cần tệp Excel thật trong biến môi trường VTVL_TEST_XLSX và Node"]
    async fn chay_that() {
        let x = std::env::var("VTVL_TEST_XLSX").expect("thiếu VTVL_TEST_XLSX");
        let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(SCRIPT);
        let b = chay("node", &script, Path::new(&x), "Thử", true).await.unwrap();
        println!("KET LUAN {} | {} nhóm | {} chỉ số | {} phiếu", b.ket_luan, b.nhom.len(), b.chi_so.len(), b.phieu.len());
        for g in b.nhom.iter().take(4) { println!("  {} [{}] x{} {} ({} mục)", g.id, g.muc, g.so_luong, g.ten, g.chi_tiet.len()); }
    }

    #[tokio::test]
    async fn thieu_tap_lenh_bao_loi_ro() {
        let e = chay("node", Path::new("/khong/co/t.mjs"), Path::new("/x.xlsx"), "a", true).await.unwrap_err();
        assert!(e.contains("Không thấy tập lệnh thẩm định"));
    }
}
