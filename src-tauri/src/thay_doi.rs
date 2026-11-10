//! Tính các thay đổi cần gửi: so các dòng đạt kiểm tra trong Excel với ảnh chụp hồ sơ trên máy chủ theo khóa nghiệp vụ.
//! Hàm thuần (không I/O). Chính sách theo quyết định 09/11/2026: dòng còn lỗi phải sửa không đưa vào gói; dòng trùng bỏ qua; xóa dòng bật.

use crate::kiem_tra_local::DongTho;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};

pub type Truong = BTreeMap<String, Option<String>>;

/// Một dòng hồ sơ trên máy chủ đã chuẩn hóa: `data` theo chữ cột của biểu.
#[derive(Debug, Clone, PartialEq)]
pub struct DongMayChu {
    pub row_id: String,
    pub version: Option<u64>,
    pub data: BTreeMap<String, String>,
}

/// Ảnh chụp hồ sơ theo khóa biểu (`a1`, `b1`, `du_bao_5_nam`…).
pub type AnhChup = BTreeMap<String, Vec<DongMayChu>>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ThayDoiItem {
    pub id: String,
    pub bieu: String,
    #[serde(rename = "dongExcel")]
    pub dong_excel: Option<u32>,
    pub khoa: String,
    /// `tao` | `sua` | `bo`.
    pub loai: String,
    #[serde(rename = "rowId", skip_serializing_if = "Option::is_none")]
    pub row_id: Option<String>,
    #[serde(rename = "phienBanDong", skip_serializing_if = "Option::is_none")]
    pub phien_ban_dong: Option<u64>,
    pub truong: Truong,
    pub truoc: Option<Truong>,
    #[serde(rename = "trangThai")]
    pub trang_thai: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BoQua {
    pub bieu: String,
    #[serde(rename = "dongExcel")]
    pub dong_excel: u32,
    #[serde(rename = "lyDo")]
    pub ly_do: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct KetQuaTinh {
    #[serde(rename = "thayDoi")]
    pub thay_doi: Vec<ThayDoiItem>,
    #[serde(rename = "boQua")]
    pub bo_qua: Vec<BoQua>,
    #[serde(rename = "canhBao")]
    pub canh_bao: Vec<String>,
    #[serde(rename = "khongDoi")]
    pub khong_doi: usize,
    /// Số thay đổi xóa nhiều bất thường: giao diện phải xác nhận riêng.
    #[serde(rename = "xoaNhieu")]
    pub xoa_nhieu: bool,
}

impl KetQuaTinh {
    pub fn dem(&self, loai: &str) -> usize {
        self.thay_doi.iter().filter(|t| t.loai == loai).count()
    }
}

/// Cột khóa nghiệp vụ từng biểu (cùng `$t` của cổng).
pub fn cot_khoa(form: &str) -> &'static [&'static str] {
    match form {
        "b2_ct" => &["A", "D", "K"],
        "du_bao_5_nam" | "d2" => &["A", "B"],
        _ => &["A"],
    }
}

fn chuan_ma(s: &str) -> String {
    let gop = s.split_whitespace().collect::<Vec<_>>().join(" ").replace(['–', '—'], "-");
    gop.split('-').map(str::trim).collect::<Vec<_>>().join("-").to_lowercase()
}

/// Khóa nghiệp vụ đã chuẩn hóa; `None` nếu thiếu cột khóa nào.
pub fn ma_khoa<'a>(form: &str, get: impl Fn(&str) -> Option<&'a str>) -> Option<String> {
    let mut parts = Vec::new();
    for c in cot_khoa(form) {
        let v = chuan_ma(get(c)?);
        if v.is_empty() {
            return None;
        }
        parts.push(v);
    }
    Some(parts.join("\u{1}"))
}

fn trong(v: Option<&str>) -> Option<&str> {
    v.map(str::trim).filter(|s| !s.is_empty())
}

/// Hai giá trị coi là bằng nhau: cùng chữ sau khi bỏ khoảng trắng đầu cuối, hoặc cùng số ("10" = "10.0"); trống = trống.
pub fn bang_nhau(a: Option<&str>, b: Option<&str>) -> bool {
    match (trong(a), trong(b)) {
        (None, None) => true,
        (Some(x), Some(y)) => x == y || matches!((x.parse::<f64>(), y.parse::<f64>()), (Ok(p), Ok(q)) if (p - q).abs() < 1e-9),
        _ => false,
    }
}

struct Ctx<'a> {
    cho_sua: Option<&'a [String]>,
    cot_nhap: &'a BTreeMap<String, Vec<String>>,
    dong_loi: &'a HashSet<(String, u32)>,
    cho_phep_xoa: bool,
}

/// `excel`: dòng đã chuẩn hóa theo biểu (chỉ biểu có trong tệp). `anh`: ảnh chụp máy chủ.
/// `cho_sua`: biểu tài khoản được phân công sửa (`None` = không biết, không lọc). Biểu không được sửa: mọi dòng bị bỏ qua, không xóa gì.
pub fn tinh(excel: &BTreeMap<String, Vec<DongTho>>, cot_nhap: &BTreeMap<String, Vec<String>>, dong_loi: &HashSet<(String, u32)>, anh: &AnhChup, cho_phep_xoa: bool, cho_sua: Option<&[String]>) -> KetQuaTinh {
    let ctx = Ctx { cho_sua, cot_nhap, dong_loi, cho_phep_xoa };
    let mut kq = KetQuaTinh::default();
    let mut so_thu_tu = 0usize;
    for (form, rows) in excel {
        tinh_mot_bieu(form, rows, anh.get(form).map(Vec::as_slice).unwrap_or(&[]), &ctx, &mut kq, &mut so_thu_tu);
    }
    let xoa = kq.dem("bo");
    if xoa > 0 {
        kq.canh_bao.push(format!("Có {xoa} thay đổi xóa dòng có trên máy chủ mà tệp Excel không còn."));
    }
    kq
}

fn tinh_mot_bieu(form: &str, rows: &[DongTho], server: &[DongMayChu], ctx: &Ctx, kq: &mut KetQuaTinh, n: &mut usize) {
    if ctx.cho_sua.is_some_and(|c| !c.iter().any(|f| f == form)) {
        for r in rows {
            kq.bo_qua.push(BoQua { bieu: form.into(), dong_excel: r.row_no, ly_do: "khong_duoc_phan_cong".into() });
        }
        if !rows.is_empty() {
            kq.canh_bao.push(format!("{form}: tài khoản không được phân công sửa biểu này, {} dòng bị bỏ qua.", rows.len()));
        }
        return;
    }
    let cot: Vec<&str> = ctx.cot_nhap.get(form).map(|v| v.iter().map(String::as_str).collect()).unwrap_or_default();
    let mut theo_khoa: HashMap<String, &DongMayChu> = HashMap::new();
    for s in server {
        if let Some(k) = ma_khoa(form, |c| s.data.get(c).map(String::as_str)) {
            theo_khoa.entry(k).or_insert(s);
        }
    }
    let mut co_trong_tep: HashSet<String> = HashSet::new();
    let mut da_thay: HashSet<String> = HashSet::new();
    let mut tiep = || { *n += 1; format!("td-{:06}", *n) };

    for r in rows {
        let khoa = ma_khoa(form, |c| r.data.get(c).and_then(|v| v.as_deref()));
        if let Some(k) = &khoa {
            co_trong_tep.insert(k.clone()); // dòng lỗi vẫn "có mặt": không xóa dòng tương ứng trên máy chủ
        }
        if ctx.dong_loi.contains(&(form.to_string(), r.row_no)) {
            kq.bo_qua.push(BoQua { bieu: form.into(), dong_excel: r.row_no, ly_do: "dong_loi".into() });
            continue;
        }
        let Some(khoa) = khoa else {
            kq.bo_qua.push(BoQua { bieu: form.into(), dong_excel: r.row_no, ly_do: "thieu_khoa".into() });
            continue;
        };
        if !da_thay.insert(khoa.clone()) {
            kq.bo_qua.push(BoQua { bieu: form.into(), dong_excel: r.row_no, ly_do: "trung_trong_tep".into() });
            continue;
        }
        let moi: Truong = cot.iter().map(|c| ((*c).to_string(), trong(r.data.get(*c).and_then(|v| v.as_deref())).map(str::to_string))).collect();
        match theo_khoa.get(&khoa) {
            None => {
                let truong: Truong = moi.into_iter().filter(|(_, v)| v.is_some()).collect();
                kq.thay_doi.push(ThayDoiItem { id: tiep(), bieu: form.into(), dong_excel: Some(r.row_no), khoa, loai: "tao".into(), row_id: None, phien_ban_dong: None, truong, truoc: None, trang_thai: "san_sang".into() });
            }
            Some(s) => {
                // cột khóa chỉ để nhận dạng dòng (cổng so khóa không phân biệt hoa/thường), không tính là thay đổi
                let khac: Vec<&String> = moi.keys().filter(|c| !cot_khoa(form).contains(&c.as_str())).filter(|c| !bang_nhau(moi[*c].as_deref(), s.data.get(*c).map(String::as_str))).collect();
                if khac.is_empty() {
                    kq.khong_doi += 1;
                    continue;
                }
                let truong: Truong = khac.iter().map(|c| ((*c).clone(), moi[*c].clone())).collect();
                let truoc: Truong = khac.iter().map(|c| ((*c).clone(), trong(s.data.get(*c).map(String::as_str)).map(str::to_string))).collect();
                if truong.values().any(Option::is_none) {
                    kq.canh_bao.push(format!("{form} dòng {}: ô trống trong Excel sẽ xóa giá trị đang có trên máy chủ.", r.row_no));
                }
                kq.thay_doi.push(ThayDoiItem { id: tiep(), bieu: form.into(), dong_excel: Some(r.row_no), khoa, loai: "sua".into(), row_id: Some(s.row_id.clone()), phien_ban_dong: s.version, truong, truoc: Some(truoc), trang_thai: "san_sang".into() });
            }
        }
    }
    if !ctx.cho_phep_xoa {
        return;
    }
    let mut xoa = Vec::new();
    for s in server {
        if let Some(k) = ma_khoa(form, |c| s.data.get(c).map(String::as_str)) {
            if !co_trong_tep.contains(&k) && theo_khoa.get(&k).is_some_and(|x| x.row_id == s.row_id) {
                xoa.push((k, s));
            }
        }
    }
    if xoa.len() > 10 && xoa.len() * 2 > server.len() {
        kq.xoa_nhieu = true;
        kq.canh_bao.push(format!("{form}: xóa {} trên {} dòng của máy chủ, nhiều bất thường. Kiểm tra lại tệp Excel có đúng biểu và đủ dòng không.", xoa.len(), server.len()));
    }
    for (khoa, s) in xoa {
        let truoc: Truong = s.data.iter().map(|(c, v)| (c.clone(), trong(Some(v)).map(str::to_string))).collect();
        kq.thay_doi.push(ThayDoiItem { id: tiep(), bieu: form.into(), dong_excel: None, khoa, loai: "bo".into(), row_id: Some(s.row_id.clone()), phien_ban_dong: s.version, truong: Truong::new(), truoc: Some(truoc), trang_thai: "san_sang".into() });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dong(n: u32, kv: &[(&str, &str)]) -> DongTho {
        DongTho { row_no: n, data: kv.iter().map(|(k, v)| (k.to_string(), if v.is_empty() { None } else { Some(v.to_string()) })).collect() }
    }
    fn mc(id: &str, kv: &[(&str, &str)]) -> DongMayChu {
        DongMayChu { row_id: id.into(), version: Some(1), data: kv.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect() }
    }
    fn nhap() -> BTreeMap<String, Vec<String>> {
        BTreeMap::from([("b1".to_string(), vec!["A".to_string(), "C".to_string(), "D".to_string()])])
    }
    fn chay(excel: Vec<DongTho>, server: Vec<DongMayChu>, loi: &[u32], xoa: bool) -> KetQuaTinh {
        let loi: HashSet<(String, u32)> = loi.iter().map(|n| ("b1".to_string(), *n)).collect();
        tinh(&BTreeMap::from([("b1".to_string(), excel)]), &nhap(), &loi, &BTreeMap::from([("b1".to_string(), server)]), xoa, None)
    }

    #[test]
    fn creates_updates_and_ignores_unchanged() {
        let kq = chay(
            vec![dong(3, &[("A", "CV-1"), ("C", "10")]), dong(4, &[("A", "CV-2"), ("C", "12")]), dong(5, &[("A", "CV-3"), ("C", "5")])],
            vec![mc("r2", &[("A", "cv-2"), ("C", "10")]), mc("r3", &[("A", "CV-3"), ("C", "5.0")])],
            &[], false,
        );
        assert_eq!((kq.dem("tao"), kq.dem("sua"), kq.dem("bo"), kq.khong_doi), (1, 1, 0, 1));
        let sua = kq.thay_doi.iter().find(|t| t.loai == "sua").unwrap();
        assert_eq!(sua.row_id.as_deref(), Some("r2"));
        assert_eq!(sua.truong, Truong::from([("C".to_string(), Some("12".to_string()))]));
        assert_eq!(sua.truoc.as_ref().unwrap()["C"].as_deref(), Some("10"));
    }

    #[test]
    fn error_rows_are_skipped_and_never_cause_deletion() {
        let kq = chay(vec![dong(3, &[("A", "CV-1"), ("C", "x")])], vec![mc("r1", &[("A", "CV-1"), ("C", "10")])], &[3], true);
        assert!(kq.thay_doi.is_empty());
        assert_eq!(kq.bo_qua, vec![BoQua { bieu: "b1".into(), dong_excel: 3, ly_do: "dong_loi".into() }]);
    }

    #[test]
    fn deletion_follows_policy_and_keeps_before_values() {
        let server = vec![mc("r1", &[("A", "CV-1"), ("C", "10")]), mc("r9", &[("A", "CV-9"), ("C", "3")])];
        let tat = chay(vec![dong(3, &[("A", "CV-1"), ("C", "10")])], server.clone(), &[], false);
        assert_eq!(tat.dem("bo"), 0);
        let bat = chay(vec![dong(3, &[("A", "CV-1"), ("C", "10")])], server, &[], true);
        let bo = bat.thay_doi.iter().find(|t| t.loai == "bo").unwrap();
        assert_eq!((bo.row_id.as_deref(), bo.dong_excel, bo.truoc.as_ref().unwrap()["C"].as_deref()), (Some("r9"), None, Some("3")));
        assert!(bat.canh_bao.iter().any(|c| c.contains("xóa dòng")));
    }

    #[test]
    fn mass_deletion_is_flagged() {
        let server: Vec<DongMayChu> = (0..30).map(|i| mc(&format!("r{i}"), &[("A", &format!("CV-{i}"))])).collect();
        let kq = chay(vec![dong(3, &[("A", "CV-0")])], server, &[], true);
        assert_eq!(kq.dem("bo"), 29);
        assert!(kq.xoa_nhieu);
    }

    #[test]
    fn blank_cell_clears_server_value_with_warning_and_duplicates_are_skipped() {
        let kq = chay(
            vec![dong(3, &[("A", "CV-1"), ("C", "")]), dong(4, &[("A", " cv-1 "), ("C", "7")]), dong(5, &[("A", ""), ("C", "1")])],
            vec![mc("r1", &[("A", "CV-1"), ("C", "10")])], &[], false,
        );
        assert_eq!(kq.dem("sua"), 1);
        assert!(kq.canh_bao.iter().any(|c| c.contains("sẽ xóa giá trị")));
        let ly_do: Vec<&str> = kq.bo_qua.iter().map(|b| b.ly_do.as_str()).collect();
        assert_eq!(ly_do, vec!["trung_trong_tep", "thieu_khoa"]);
    }

    #[test]
    fn unassigned_forms_are_skipped_entirely() {
        let excel = BTreeMap::from([("b1".to_string(), vec![dong(3, &[("A", "CV-1"), ("C", "1")])])]);
        let anh = BTreeMap::from([("b1".to_string(), vec![mc("r9", &[("A", "CV-9")])])]);
        let kq = tinh(&excel, &nhap(), &HashSet::new(), &anh, true, Some(&["a1".to_string()]));
        assert!(kq.thay_doi.is_empty(), "không tạo, sửa hay xóa biểu không được phân công");
        assert_eq!(kq.bo_qua[0].ly_do, "khong_duoc_phan_cong");
        let cho = tinh(&excel, &nhap(), &HashSet::new(), &anh, true, Some(&["b1".to_string()]));
        assert_eq!((cho.dem("tao"), cho.dem("bo")), (1, 1));
    }

    #[test]
    fn composite_keys_and_normalization() {
        let k = |a: &str, d: &str, kk: &str| ma_khoa("b2_ct", |c| match c { "A" => Some(a), "D" => Some(d), "K" => Some(kk), _ => None });
        assert_eq!(k("CV - 1", "Công  đoạn", "2026"), k("cv-1", "công đoạn", "2026"));
        assert_eq!(k("CV-1", "", "2026"), None);
        assert!(bang_nhau(Some("10"), Some("10.0")) && bang_nhau(None, Some("  ")) && !bang_nhau(Some("a"), None));
    }
}
