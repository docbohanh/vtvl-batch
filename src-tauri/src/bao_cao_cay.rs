//! Báo cáo tổng hợp theo cây đơn vị ("Báo cáo tổng hợp - Biểu 01"): cột khớp Biểu 01 của bộ 05 biểu
//! (nhiệm vụ, công việc, sản phẩm, vị trí việc làm, nhu cầu nhân lực, phương án biên chế 2027–2031) kèm B1, C3.
//! Quét CHỈ ĐỌC các biểu của mọi hồ sơ trong cache quản trị, lưu số liệu cục bộ, xuất Excel 3 sheet:
//! "Tổng", "Danh sách đơn vị" (theo cây) và "Thiếu PA bố trí 2028-2031" (cũng theo cây).

use crate::quan_tri::{DanhSach, HoSoQt, NutQt};
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, Worksheet};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, State};
use crate::{lay_lo, AppState};

/// Tên báo cáo (mục menu, tiêu đề hộp thoại, tên tệp gợi ý).
pub const TEN_BAO_CAO: &str = "Báo cáo tổng hợp - Biểu 01";
/// Số giờ làm việc một người một năm (cùng định mức C3).
pub const GIO_MOT_NGUOI_NAM: f64 = 1904.0;
pub const NAM_PA: [i32; 5] = [2027, 2028, 2029, 2030, 2031];
/// Phiên bản định dạng số liệu quét; thấp hơn thì quét lại hồ sơ đó.
pub const PHIEN_BAN_SO_LIEU: u8 = 2;

/// Số liệu đã rút gọn của một hồ sơ (cách tính theo ghi chú Biểu 01):
/// nhiệm vụ = số dòng A1; công việc = số dòng A2; sản phẩm = số công việc có sản phẩm (cột E của A2); VTVL = số dòng C1;
/// nhu cầu = Σ người quy đổi theo phương pháp từng dòng C3 (PP1: cột H, PP2: cột G, PP3: cột I);
/// `gio_b1` = Σ "Giờ tổng" B1; `c3` = Σ "Người cần bố trí"; `d2` = Σ "Số người cần bố trí trong năm phương án" theo năm.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct SoLieu {
    pub id: String,
    #[serde(default)]
    pub pb: u8,
    #[serde(rename = "gioB1", default)]
    pub gio_b1: f64,
    #[serde(default)]
    pub c3: f64,
    #[serde(default)]
    pub d2: BTreeMap<i32, f64>,
    #[serde(rename = "nhiemVu", default)]
    pub nhiem_vu: u32,
    #[serde(rename = "congViec", default)]
    pub cong_viec: u32,
    #[serde(rename = "sanPham", default)]
    pub san_pham: u32,
    #[serde(default)]
    pub vtvl: u32,
    #[serde(rename = "nhuCau", default)]
    pub nhu_cau: f64,
}

/// Tệp lưu số liệu để xuất lại không phải quét lại cổng.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct KhoSoLieu {
    #[serde(rename = "quetLuc")]
    pub quet_luc: String,
    #[serde(rename = "kyId")]
    pub ky_id: String,
    pub ds: Vec<SoLieu>,
}

/// Đọc số từ ô: số, hoặc chuỗi kiểu 1.234,5 / 1234.5; không đọc được thì 0.
pub fn so_tu_o(v: &serde_json::Value) -> f64 {
    match v {
        serde_json::Value::Number(n) => n.as_f64().filter(|x| x.is_finite()).unwrap_or(0.0),
        serde_json::Value::String(s) => {
            let t: String = s.chars().filter(|c| !c.is_whitespace()).collect();
            if t.is_empty() || !t.chars().all(|c| c.is_ascii_digit() || matches!(c, '.' | ',' | '-' | '+')) { return 0.0; }
            let t = if t.contains(',') && t.contains('.') { t.replace('.', "").replace(',', ".") } else { t.replace(',', ".") };
            t.parse::<f64>().ok().filter(|x| x.is_finite()).unwrap_or(0.0)
        }
        _ => 0.0,
    }
}

/// Các biểu (mỗi dòng là `data` theo chữ cột) của một hồ sơ.
pub struct CacBieu<'a> { pub b1: &'a [serde_json::Value], pub c3: &'a [serde_json::Value], pub d2: &'a [serde_json::Value], pub a1: &'a [serde_json::Value], pub a2: &'a [serde_json::Value], pub c1: &'a [serde_json::Value] }

/// Cột "người" của C3 theo phương pháp ở cột B.
fn cot_nguoi_theo_pp(pp: &str) -> Option<&'static str> {
    match pp.trim().to_uppercase().as_str() { "PP1" => Some("H"), "PP2" => Some("G"), "PP3" => Some("I"), _ => None }
}

pub fn tom_tat(id: &str, b: &CacBieu) -> SoLieu {
    let mut nam: BTreeMap<i32, f64> = BTreeMap::new();
    for d in b.d2 {
        let n = so_tu_o(&d["B"]) as i32;
        if n != 0 { *nam.entry(n).or_insert(0.0) += so_tu_o(&d["C"]); }
    }
    let co_chu = |v: &serde_json::Value| v.as_str().is_some_and(|t| !t.trim().is_empty()) || v.is_number();
    SoLieu {
        id: id.into(), pb: PHIEN_BAN_SO_LIEU,
        gio_b1: b.b1.iter().map(|d| so_tu_o(&d["G"])).sum(),
        c3: b.c3.iter().map(|d| so_tu_o(&d["J"])).sum(),
        d2: nam,
        nhiem_vu: b.a1.len() as u32, cong_viec: b.a2.len() as u32,
        san_pham: b.a2.iter().filter(|d| co_chu(&d["E"])).count() as u32,
        vtvl: b.c1.len() as u32,
        nhu_cau: b.c3.iter().map(|d| d["B"].as_str().and_then(cot_nguoi_theo_pp).map(|c| so_tu_o(&d[c])).unwrap_or(0.0)).sum(),
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Tong {
    pub so_ho_so: u32,
    pub nhiem_vu: f64,
    pub cong_viec: f64,
    pub san_pham: f64,
    pub vtvl: f64,
    pub nhu_cau: f64,
    pub b1: f64,
    pub c3: f64,
    pub d2: [f64; 5],
}

impl Tong {
    fn cong(&self, o: &Tong) -> Tong {
        let mut d2 = [0.0; 5];
        for i in 0..5 { d2[i] = self.d2[i] + o.d2[i]; }
        Tong { so_ho_so: self.so_ho_so + o.so_ho_so, nhiem_vu: self.nhiem_vu + o.nhiem_vu, cong_viec: self.cong_viec + o.cong_viec, san_pham: self.san_pham + o.san_pham,
               vtvl: self.vtvl + o.vtvl, nhu_cau: self.nhu_cau + o.nhu_cau, b1: self.b1 + o.b1, c3: self.c3 + o.c3, d2 }
    }
    fn tu(s: &SoLieu) -> Tong {
        let mut d2 = [0.0; 5];
        for (i, y) in NAM_PA.iter().enumerate() { d2[i] = s.d2.get(y).copied().unwrap_or(0.0); }
        Tong { so_ho_so: 1, nhiem_vu: s.nhiem_vu as f64, cong_viec: s.cong_viec as f64, san_pham: s.san_pham as f64, vtvl: s.vtvl as f64,
               nhu_cau: s.nhu_cau, b1: s.gio_b1 / GIO_MOT_NGUOI_NAM, c3: s.c3, d2 }
    }
}

type BangTong = HashMap<String, Tong>;

/// Cây đơn vị kèm hồ sơ và số liệu.
pub struct Cay<'a> {
    con: HashMap<&'a str, Vec<&'a NutQt>>,
    goc: Vec<&'a NutQt>,
    ho_so: HashMap<&'a str, (&'a HoSoQt, Tong)>,
    tong: BangTong,
}

fn so_ten(a: &&NutQt, b: &&NutQt) -> std::cmp::Ordering { a.ten.to_lowercase().cmp(&b.ten.to_lowercase()) }

impl<'a> Cay<'a> {
    pub fn dung(ds: &'a DanhSach, so_lieu: &'a [SoLieu]) -> Cay<'a> {
        let theo_id: HashMap<&str, &SoLieu> = so_lieu.iter().map(|s| (s.id.as_str(), s)).collect();
        let nut: HashMap<&str, &NutQt> = ds.don_vi.iter().map(|n| (n.id.as_str(), n)).collect();
        let mut ho_so = HashMap::new();
        for h in &ds.ho_so {
            if let (true, Some(s)) = (nut.contains_key(h.org_id.as_str()), theo_id.get(h.id.as_str())) {
                ho_so.entry(h.org_id.as_str()).or_insert((h, Tong::tu(s)));
            }
        }
        let mut con: HashMap<&str, Vec<&NutQt>> = HashMap::new();
        let mut goc = Vec::new();
        for n in &ds.don_vi {
            match n.cha_id.as_deref() {
                Some(c) if nut.contains_key(c) && c != n.id => con.entry(c).or_default().push(n),
                _ => goc.push(n),
            }
        }
        con.values_mut().for_each(|v| v.sort_by(so_ten));
        goc.sort_by(so_ten);
        let mut cay = Cay { con, goc, ho_so, tong: HashMap::new() };
        cay.tong = cay.tong_theo(&|_| true);
        cay
    }

    /// Tổng cộng dồn từng nhánh, chỉ tính hồ sơ thỏa `loc` (đệ quy có chặn vòng lặp).
    pub fn tong_theo(&self, loc: &dyn Fn(&Tong) -> bool) -> BangTong {
        fn di(c: &Cay, n: &NutQt, loc: &dyn Fn(&Tong) -> bool, ra: &mut BangTong, dang_di: &mut HashSet<String>) -> Tong {
            if let Some(t) = ra.get(&n.id) { return t.clone(); }
            if !dang_di.insert(n.id.clone()) { return Tong::default(); }
            let mut t = c.ho_so.get(n.id.as_str()).map(|x| x.1.clone()).filter(|x| loc(x)).unwrap_or_default();
            for k in c.con.get(n.id.as_str()).into_iter().flatten() { t = t.cong(&di(c, k, loc, ra, dang_di)); }
            dang_di.remove(&n.id);
            ra.insert(n.id.clone(), t.clone());
            t
        }
        let mut ra = BangTong::new();
        for n in &self.goc { di(self, n, loc, &mut ra, &mut HashSet::new()); }
        ra
    }

    fn tong_cua(&self, n: &NutQt) -> Tong { self.tong.get(&n.id).cloned().unwrap_or_default() }
    fn con_co_hs(&self, n: &NutQt) -> Vec<&'a NutQt> {
        self.con.get(n.id.as_str()).into_iter().flatten().copied().filter(|c| self.tong_cua(c).so_ho_so > 0).collect()
    }
    pub fn tong_toan_cay(&self) -> Tong { self.goc.iter().fold(Tong::default(), |t, n| t.cong(&self.tong_cua(n))) }
}

/// UBND xã, phường, đặc khu (tách riêng ở mục IV của sheet Tổng).
pub fn la_ubnd_co_so(ten: &str) -> bool {
    let t = ten.trim().to_lowercase();
    ["ủy ban nhân dân xã ", "ủy ban nhân dân phường ", "ủy ban nhân dân đặc khu "].iter().any(|p| t.starts_with(p))
}

/// Đơn vị có C3 hoặc D2 > 0 nhưng thiếu D2 (0/trống) ở ít nhất một năm 2028–2031: trả các năm thiếu.
pub fn nam_thieu(o: &Tong) -> Vec<i32> {
    if !(o.c3 > 0.0 || o.nhu_cau > 0.0 || o.d2.iter().any(|x| *x > 0.0)) { return Vec::new(); }
    (1..5).filter(|i| o.d2[*i] <= 0.0).map(|i| NAM_PA[i]).collect()
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

fn e(x: rust_xlsxwriter::XlsxError) -> String { x.to_string() }
fn lam_tron(x: f64) -> f64 { (x * 100.0).round() / 100.0 }

struct KieuO { tieu_de: Format, chu: Format, dam: Format, nhom: Format, so: Format, so_le: Format, so_dam: Format, so_le_dam: Format, tho: Format, dam14: Format, thieu: Format }

impl KieuO {
    fn moi() -> KieuO {
        let vien = |f: Format| f.set_border(FormatBorder::Thin).set_border_color(Color::RGB(0xBFBFBF)).set_font_name("Times New Roman");
        let phu = Color::RGB(0xDDEBF7);
        KieuO {
            tieu_de: vien(Format::new()).set_bold().set_font_color(Color::White).set_background_color(Color::RGB(0x1F4E78)).set_align(FormatAlign::Center).set_align(FormatAlign::VerticalCenter).set_text_wrap(),
            chu: vien(Format::new()),
            dam: vien(Format::new()).set_bold(),
            nhom: vien(Format::new()).set_bold().set_background_color(Color::RGB(0xF2F2F2)),
            so: vien(Format::new()).set_num_format("#,##0"),
            so_le: vien(Format::new()).set_num_format("#,##0.00"),
            so_dam: vien(Format::new()).set_bold().set_background_color(phu).set_num_format("#,##0"),
            so_le_dam: vien(Format::new()).set_bold().set_background_color(phu).set_num_format("#,##0.00"),
            tho: Format::new().set_font_name("Times New Roman").set_italic().set_font_size(10),
            dam14: Format::new().set_bold().set_font_size(14).set_font_name("Times New Roman"),
            thieu: vien(Format::new()).set_bold().set_font_color(Color::RGB(0x9C0006)).set_background_color(Color::RGB(0xFFC7CE)).set_num_format("#,##0"),
        }
    }
    /// Số nguyên không kèm dấu thập phân; số lẻ hai chữ số.
    fn so_cua(&self, x: f64, dam: bool) -> &Format {
        match (x.fract() == 0.0, dam) { (true, false) => &self.so, (false, false) => &self.so_le, (true, true) => &self.so_dam, (false, true) => &self.so_le_dam }
    }
}

fn ghi_so(ws: &mut Worksheet, r: u32, c: u16, x: f64, k: &KieuO, dam: bool) -> Result<(), String> {
    let x = lam_tron(x);
    ws.write_number_with_format(r, c, x, k.so_cua(x, dam)).map(|_| ()).map_err(e)
}

fn chu(ws: &mut Worksheet, r: u32, c: u16, t: &str, f: &Format) -> Result<(), String> { ws.write_string_with_format(r, c, t, f).map(|_| ()).map_err(e) }

/// Cột tiêu đề: cột đơn (gộp hai dòng) hoặc nhóm (tên nhóm ở dòng trên, các cột con ở dòng dưới) như Biểu 01.
enum Cot { Don(&'static str), Nhom(&'static str, Vec<String>) }

fn tieu_de2(ws: &mut Worksheet, r0: u32, cot: &[Cot], k: &KieuO) -> Result<u16, String> {
    let mut c = 0u16;
    for x in cot {
        match x {
            Cot::Don(t) => { ws.merge_range(r0, c, r0 + 1, c, t, &k.tieu_de).map_err(e)?; c += 1; }
            Cot::Nhom(t, con) => {
                ws.merge_range(r0, c, r0, c + con.len() as u16 - 1, t, &k.tieu_de).map_err(e)?;
                for (i, s) in con.iter().enumerate() { chu(ws, r0 + 1, c + i as u16, s, &k.tieu_de)?; }
                c += con.len() as u16;
            }
        }
    }
    ws.set_row_height(r0, 30).map_err(e)?;
    ws.set_row_height(r0 + 1, 24).map(|_| ()).map_err(e)?;
    Ok(c)
}

fn nam_cot() -> Vec<String> { NAM_PA.iter().map(|y| format!("Năm {y}")).collect() }

/// Các cột chỉ tiêu theo thứ tự Biểu 01 (nhiệm vụ … phương án 2031), bắt đầu từ cột `c0`.
fn cot_chi_tieu() -> Vec<Cot> {
    vec![Cot::Don("Tổng số nhiệm vụ"), Cot::Don("Tổng số công việc"), Cot::Don("Tổng số sản phẩm"), Cot::Don("Tổng số vị trí việc làm"), Cot::Don("Số nhu cầu nhân lực"), Cot::Nhom("Phương án biên chế", nam_cot())]
}

/// `to_do`: các năm phương án (theo thứ tự 2027–2031) thiếu, ô bằng 0 được tô đỏ.
fn ghi_chi_tieu(ws: &mut Worksheet, r: u32, c0: u16, t: &Tong, k: &KieuO, dam: bool, to_do: [bool; 5]) -> Result<(), String> {
    for (i, x) in [t.nhiem_vu, t.cong_viec, t.san_pham, t.vtvl, t.nhu_cau].iter().enumerate() { ghi_so(ws, r, c0 + i as u16, *x, k, dam)?; }
    for i in 0..5 {
        if to_do[i] && lam_tron(t.d2[i]) == 0.0 { ws.write_number_with_format(r, c0 + 5 + i as u16, 0.0, &k.thieu).map_err(e)?; }
        else { ghi_so(ws, r, c0 + 5 + i as u16, t.d2[i], k, dam)?; }
    }
    Ok(())
}

const GHI_CHU_CACH_TINH: &str = "Cách tính như Biểu 01: nhiệm vụ = số dòng A1; công việc = số dòng A2; sản phẩm = số công việc có sản phẩm; VTVL = số dòng C1; nhu cầu nhân lực = Σ người quy đổi theo phương pháp từng dòng C3, giữ thập phân; phương án biên chế = Σ cột \"Số người cần bố trí trong năm phương án\" của D2. B1 = Σ \"Giờ tổng\" ÷ 1.904. C3 = Σ \"Người cần bố trí\". Cộng thẳng từ hồ sơ, chưa loại trừ người kiêm nhiệm giữa các đơn vị.";

fn sheet_tong(ws: &mut Worksheet, cay: &Cay, ds: &DanhSach, k: &KieuO) -> Result<(), String> {
    ws.set_name("Tổng").map_err(e)?;
    chu(ws, 0, 0, &format!("{} – TỔNG HỢP", TEN_BAO_CAO.to_uppercase()), &k.dam14)?;
    chu(ws, 1, 0, &format!("Kỳ {}. Nguồn: hồ sơ trên cổng, quét lúc {}. Cây đơn vị: {} nút; hồ sơ có số liệu: {}/{}.", ds.ky.ten, ds.quet_luc, ds.don_vi.len(), cay.ho_so.len(), ds.ho_so.len()), &k.tho)?;
    chu(ws, 2, 0, GHI_CHU_CACH_TINH, &k.tho)?;
    let mut cot = vec![Cot::Don("STT"), Cot::Don("Đơn vị / nhánh"), Cot::Don("Số hồ sơ")];
    cot.extend(cot_chi_tieu());
    cot.extend([Cot::Don("B1: người ước lượng"), Cot::Don("C3: Σ người cần bố trí"), Cot::Don("Chênh nhu cầu − PA 2027")]);
    let so_cot = tieu_de2(ws, 4, &cot, k)?;
    let mut r = 6u32;
    let muc = |ws: &mut Worksheet, r: u32, t: &str| -> Result<(), String> {
        for c in 0..so_cot { chu(ws, r, c, if c == 0 { t } else { "" }, &k.nhom)?; }
        Ok(())
    };
    let dong = |ws: &mut Worksheet, r: u32, stt: Option<usize>, ten: &str, t: &Tong, dam: bool| -> Result<(), String> {
        if let Some(s) = stt { ghi_so(ws, r, 0, s as f64, k, dam)?; } else { chu(ws, r, 0, "", if dam { &k.dam } else { &k.chu })?; }
        chu(ws, r, 1, ten, if dam { &k.dam } else { &k.chu })?;
        ghi_so(ws, r, 2, t.so_ho_so as f64, k, dam)?;
        ghi_chi_tieu(ws, r, 3, t, k, dam, [false; 5])?;
        ghi_so(ws, r, 13, t.b1, k, dam)?; ghi_so(ws, r, 14, t.c3, k, dam)?; ghi_so(ws, r, 15, t.nhu_cau - t.d2[0], k, dam)
    };
    muc(ws, r, "I. TOÀN CÂY ĐƠN VỊ")?; r += 1;
    dong(ws, r, None, "Tổng cộng", &cay.tong_toan_cay(), true)?; r += 2;
    muc(ws, r, "II. THEO CẤP ĐƠN VỊ (cấp ghi trên hồ sơ)")?; r += 1;
    for (ma, ten) in [("TINH", "Cấp tỉnh"), ("XA", "Cấp xã, phường")] {
        let t = cay.ho_so.values().filter(|(h, _)| h.cap == ma).fold(Tong::default(), |a, (_, x)| a.cong(x));
        if t.so_ho_so > 0 { dong(ws, r, None, ten, &t, false)?; r += 1; }
    }
    r += 1;
    if let Some(chia) = diem_chia(cay) {
        muc(ws, r, &format!("III. CÁC ĐƠN VỊ TRỰC THUỘC \"{}\" (không gồm UBND xã, phường)", chia.ten))?; r += 1;
        let nhanh = cay.con_co_hs(chia);
        let mut t3 = cay.ho_so.get(chia.id.as_str()).map(|x| x.1.clone()).unwrap_or_default();
        let mut stt = 0usize;
        if cay.ho_so.contains_key(chia.id.as_str()) { stt += 1; dong(ws, r, Some(stt), &format!("{} (riêng đơn vị)", chia.ten), &t3, false)?; r += 1; }
        for n in nhanh.iter().filter(|n| !la_ubnd_co_so(&n.ten)) {
            stt += 1; let t = cay.tong_cua(n); t3 = t3.cong(&t); dong(ws, r, Some(stt), &n.ten, &t, false)?; r += 1;
        }
        dong(ws, r, None, "CỘNG III", &t3, true)?; r += 2;
        muc(ws, r, "IV. ỦY BAN NHÂN DÂN XÃ, PHƯỜNG, ĐẶC KHU")?; r += 1;
        let (mut t4, mut s4) = (Tong::default(), 0usize);
        for n in nhanh.iter().filter(|n| la_ubnd_co_so(&n.ten)) {
            s4 += 1; let t = cay.tong_cua(n); t4 = t4.cong(&t); dong(ws, r, Some(s4), &n.ten, &t, false)?; r += 1;
        }
        dong(ws, r, None, "CỘNG IV", &t4, true)?; r += 2;
        dong(ws, r, None, "TỔNG CỘNG (III + IV)", &t3.cong(&t4), true)?;
    }
    let rong: [f64; 16] = [6.0, 56.0, 10.0, 11.0, 11.0, 11.0, 11.0, 13.0, 11.0, 11.0, 11.0, 11.0, 11.0, 14.0, 14.0, 14.0];
    for (c, w) in rong.iter().enumerate() { ws.set_column_width(c as u16, *w).map_err(e)?; }
    ws.set_freeze_panes(6, 2).map(|_| ()).map_err(e)
}

/// Nút phân nhánh đầu tiên của cây (đi xuống khi mỗi lần chỉ còn một nhánh có hồ sơ và nút đó không có hồ sơ riêng).
fn diem_chia<'a>(cay: &Cay<'a>) -> Option<&'a NutQt> {
    let mut n = cay.goc.iter().copied().find(|n| cay.tong_cua(n).so_ho_so > 0)?;
    loop {
        let con = cay.con_co_hs(n);
        if con.len() != 1 || cay.ho_so.contains_key(n.id.as_str()) { return Some(n); }
        n = con[0];
    }
}

/// Sheet theo cây: `thieu` = chỉ nhánh có đơn vị thiếu phương án 2028–2031 (cộng dồn chỉ tính các đơn vị thiếu).
fn sheet_cay(ws: &mut Worksheet, cay: &Cay, bang: &BangTong, thieu: bool, k: &KieuO) -> Result<(), String> {
    let (ten_sheet, tieu_de_sheet, ghi_chu) = if thieu {
        ("Thiếu PA bố trí 2028-2031", "ĐƠN VỊ THIẾU PHƯƠNG ÁN BỐ TRÍ NĂM 2028 – 2031 (THEO CÂY ĐƠN VỊ)",
         "Đơn vị có C3 hoặc D2 lớn hơn 0 nhưng D2 bằng 0 hoặc trống ở ít nhất một năm 2028–2031; ô phương án biên chế của năm thiếu tô đỏ. Dòng nhóm (in đậm): cộng của các đơn vị thiếu trong nhánh; cột \"Số hồ sơ\" là số đơn vị thiếu. Bấm +/− ở lề trái để thu gọn / mở nhánh.")
    } else {
        ("Danh sách đơn vị", "DANH SÁCH ĐƠN VỊ THEO CẤU TRÚC CÂY",
         "Dòng nhóm (đơn vị cha) in đậm: các cột chỉ tiêu là tổng của đơn vị và mọi đơn vị con (như Biểu 01). Bấm +/− ở lề trái để thu gọn / mở nhánh.")
    };
    ws.set_name(ten_sheet).map_err(e)?;
    chu(ws, 0, 0, &format!("{} – {tieu_de_sheet}", TEN_BAO_CAO.to_uppercase()), &k.dam14)?;
    chu(ws, 1, 0, ghi_chu, &k.tho)?;
    let mut cot = vec![Cot::Don("STT"), Cot::Don("Tên đơn vị (theo cây)"), Cot::Don("Mã"), Cot::Don("Cấp"), Cot::Don("Tài khoản"), Cot::Don("Tiến độ (%)"), Cot::Don("Dòng chưa đạt"), Cot::Don("Số hồ sơ")];
    cot.extend(cot_chi_tieu());
    cot.extend([Cot::Don("B1 (người ước lượng)"), Cot::Don("C3: Σ người cần bố trí")]);
    if thieu { cot.extend([Cot::Don("Số năm thiếu"), Cot::Don("Năm thiếu")]); }
    let so_cot = tieu_de2(ws, 3, &cot, k)?;
    let mut r = 5u32;
    let mut stt = 0usize;
    struct Ctx<'c, 'a> { cay: &'c Cay<'a>, bang: &'c BangTong, thieu: bool, k: &'c KieuO }
    fn di(x: &Ctx, ws: &mut Worksheet, n: &NutQt, sau: u8, r: &mut u32, stt: &mut usize) -> Result<(), String> {
        let t = x.bang.get(&n.id).cloned().unwrap_or_default();
        if t.so_ho_so == 0 { return Ok(()); }
        let k = x.k;
        *stt += 1;
        let con: Vec<&NutQt> = x.cay.con.get(n.id.as_str()).into_iter().flatten().copied().filter(|c| x.bang.get(&c.id).is_some_and(|b| b.so_ho_so > 0)).collect();
        let la_nhom = !con.is_empty();
        let (ct, cs) = if la_nhom { (&k.nhom, true) } else { (&k.chu, false) };
        ghi_so(ws, *r, 0, *stt as f64, k, cs)?;
        let thut = Format::new().set_indent(sau.min(8)).set_border(FormatBorder::Thin).set_border_color(Color::RGB(0xBFBFBF)).set_font_name("Times New Roman");
        let thut = if la_nhom { thut.set_bold().set_background_color(Color::RGB(0xF2F2F2)) } else { thut };
        chu(ws, *r, 1, &n.ten, &thut)?;
        chu(ws, *r, 2, &n.ma, ct)?;
        let h = x.cay.ho_so.get(n.id.as_str());
        chu(ws, *r, 3, h.map(|y| y.0.cap.as_str()).unwrap_or(""), ct)?;
        chu(ws, *r, 4, &h.map(|y| y.0.tai_khoan.join(", ")).unwrap_or_default(), ct)?;
        match h { Some((hs, _)) => { ghi_so(ws, *r, 5, hs.tien_do as f64, k, cs)?; ghi_so(ws, *r, 6, hs.dong_chua_dat as f64, k, cs)?; }
                  None => { chu(ws, *r, 5, "", ct)?; chu(ws, *r, 6, "", ct)?; } }
        ghi_so(ws, *r, 7, t.so_ho_so as f64, k, cs)?;
        let m = if x.thieu { h.map(|y| nam_thieu(&y.1)).unwrap_or_default() } else { Vec::new() };
        ghi_chi_tieu(ws, *r, 8, &t, k, cs, std::array::from_fn(|i| m.contains(&NAM_PA[i])))?;
        ghi_so(ws, *r, 18, t.b1, k, cs)?; ghi_so(ws, *r, 19, t.c3, k, cs)?;
        if x.thieu {
            if m.is_empty() { chu(ws, *r, 20, "", ct)?; chu(ws, *r, 21, "", ct)?; }
            else { ghi_so(ws, *r, 20, m.len() as f64, k, cs)?; chu(ws, *r, 21, &m.iter().map(|y| y.to_string()).collect::<Vec<_>>().join(", "), ct)?; }
        }
        for _ in 0..sau.min(7) { ws.group_rows(*r, *r).map_err(e)?; } // mỗi lần gọi tăng một cấp thu gọn
        *r += 1;
        for c in con { di(x, ws, c, sau + 1, r, stt)?; }
        Ok(())
    }
    let x = Ctx { cay, bang, thieu, k };
    for n in cay.goc.clone() { di(&x, ws, n, 0, &mut r, &mut stt)?; }
    let rong: [f64; 22] = [6.0, 62.0, 20.0, 7.0, 18.0, 9.0, 9.0, 9.0, 11.0, 11.0, 11.0, 11.0, 13.0, 11.0, 11.0, 11.0, 11.0, 11.0, 13.0, 14.0, 10.0, 22.0];
    for (c, w) in rong.iter().enumerate().take(so_cot as usize) { ws.set_column_width(c as u16, *w).map_err(e)?; }
    ws.set_freeze_panes(5, 2).map_err(e)?;
    ws.autofilter(4, 0, r.saturating_sub(1).max(5), so_cot - 1).map(|_| ()).map_err(e)
}

/// Ghi báo cáo ra tệp xlsx.
pub fn xuat(duong_dan: &std::path::Path, ds: &DanhSach, so_lieu: &[SoLieu]) -> Result<(), String> {
    if ds.don_vi.is_empty() { return Err("Chưa có cây đơn vị. Bấm \"Cập nhật\" ở trang Quản trị rồi thử lại.".into()); }
    let cay = Cay::dung(ds, so_lieu);
    if cay.ho_so.is_empty() { return Err("Chưa có số liệu hồ sơ nào để lập báo cáo".into()); }
    let k = KieuO::moi();
    let mut wb = Workbook::new();
    sheet_tong(wb.add_worksheet(), &cay, ds, &k)?;
    sheet_cay(wb.add_worksheet(), &cay, &cay.tong, false, &k)?;
    let bang_thieu = cay.tong_theo(&|o| !nam_thieu(o).is_empty());
    sheet_cay(wb.add_worksheet(), &cay, &bang_thieu, true, &k)?;
    wb.save(duong_dan).map_err(e)
}

// ---------------------------------------------------------------------------
// Quét cổng (chỉ GET) và lệnh Tauri
// ---------------------------------------------------------------------------

const TEP_SO_LIEU: &str = "so-lieu-bao-cao.json";
const SO_LUONG_DONG_THOI: usize = 3;
const SU_KIEN_TIEN_DO: &str = "bao-cao-tien-do";
/// Chỉ một lần quét tại một thời điểm.
static DANG_QUET: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
struct TienDo { xong: usize, tong: usize }

async fn lay_dong(s: &crate::portal::Session, id: &str, khoa: &str) -> Result<Vec<serde_json::Value>, String> {
    let ds = crate::quan_tri::lay_het_trang(s, &format!("/submissions/{id}/forms/{khoa}"), &[], 500, 20_000).await?;
    Ok(ds.into_iter().filter(|d| d["deleted"].as_bool() != Some(true)).map(|d| d["data"].clone()).collect())
}

async fn quet_mot(s: &crate::portal::Session, id: &str) -> Result<SoLieu, String> {
    let (b1, c3, d2) = (lay_dong(s, id, "b1").await?, lay_dong(s, id, "c3").await?, lay_dong(s, id, "d2").await?);
    let (a1, a2, c1) = (lay_dong(s, id, "a1").await?, lay_dong(s, id, "a2").await?, lay_dong(s, id, "c1").await?);
    Ok(tom_tat(id, &CacBieu { b1: &b1, c3: &c3, d2: &d2, a1: &a1, a2: &a2, c1: &c1 }))
}

/// Thời điểm quét của số liệu đã lưu cho kỳ hiện tại (để giao diện hỏi dùng lại hay quét lại); `None` nếu chưa có.
#[tauri::command]
pub fn bc_cay_trang_thai(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let lo = lay_lo(&state)?;
    let Ok(ds) = crate::lo::doc_json::<DanhSach>(&crate::quan_tri::tep_cache(&lo)) else { return Ok(None) };
    let kho = crate::lo::doc_json::<KhoSoLieu>(&lo.root.join("_chung").join(TEP_SO_LIEU)).ok().filter(|k| k.ky_id == ds.ky.id);
    Ok(kho.map(|k| format!("{} ({}/{} hồ sơ)", k.quet_luc, k.ds.iter().filter(|s| s.pb >= PHIEN_BAN_SO_LIEU).count(), ds.ho_so.len())))
}

/// Lập báo cáo tổng hợp theo cây ra tệp Excel. Số liệu quét từ cổng (chỉ đọc), lưu lại để lần sau xuất nhanh; `quet_lai` buộc quét lại.
#[tauri::command]
pub async fn bc_cay_xuat(duong_dan: String, quet_lai: bool, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let mut dich = std::path::PathBuf::from(duong_dan.trim());
    if dich.as_os_str().is_empty() { return Err("Chưa chọn nơi lưu tệp".into()); }
    if dich.extension().is_none_or(|e| !e.eq_ignore_ascii_case("xlsx")) { dich.set_extension("xlsx"); }
    let lo = lay_lo(&state)?;
    let ds: DanhSach = crate::lo::doc_json(&crate::quan_tri::tep_cache(&lo)).map_err(|_| "Chưa có danh sách đơn vị. Mở trang Quản trị và bấm \"Cập nhật\" trước.".to_string())?;
    if DANG_QUET.swap(true, Ordering::SeqCst) { return Err("Đang có một lần lập báo cáo chạy, chờ nó xong".into()); }
    let kq = chay(&lo, &ds, &dich, quet_lai, &app, &state).await;
    DANG_QUET.store(false, Ordering::SeqCst);
    kq
}

async fn chay(lo: &Arc<crate::Lo>, ds: &DanhSach, dich: &std::path::Path, quet_lai: bool, app: &tauri::AppHandle, state: &AppState) -> Result<String, String> {
    let tep = lo.root.join("_chung").join(TEP_SO_LIEU);
    let mut kho = crate::lo::doc_json::<KhoSoLieu>(&tep).ok().filter(|k| !quet_lai && k.ky_id == ds.ky.id).unwrap_or_default();
    kho.ds.retain(|s| s.pb >= PHIEN_BAN_SO_LIEU); // số liệu cũ thiếu cột mới: quét lại
    let co: HashSet<String> = kho.ds.iter().map(|s| s.id.clone()).collect();
    let can: Vec<String> = ds.ho_so.iter().filter(|h| !co.contains(&h.id)).map(|h| h.id.clone()).collect();
    let tong = can.len();
    if tong > 0 {
        let sess = crate::quan_tri::phien(state, lo, false).await?;
        let sem = Arc::new(tokio::sync::Semaphore::new(SO_LUONG_DONG_THOI));
        let xong = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut viec = Vec::new();
        for id in can {
            let (s, sem, xong, app) = (sess.clone(), sem.clone(), xong.clone(), app.clone());
            viec.push(tokio::spawn(async move {
                let _p = sem.acquire_owned().await.map_err(|e| e.to_string())?;
                let kq = quet_mot(&s, &id).await.map_err(|m| (id, m));
                let n = xong.fetch_add(1, Ordering::SeqCst) + 1;
                let _ = app.emit(SU_KIEN_TIEN_DO, TienDo { xong: n, tong });
                Ok::<_, String>(kq)
            }));
        }
        let mut loi: Vec<(String, String)> = Vec::new();
        for v in viec {
            match v.await.map_err(|e| e.to_string())?? { Ok(s) => kho.ds.push(s), Err(l) => loi.push(l) }
        }
        kho.quet_luc = crate::lo::bay_gio();
        kho.ky_id = ds.ky.id.clone();
        crate::lo::ghi_json(&tep, &kho)?; // giữ phần đã quét để lần sau chỉ quét tiếp phần thiếu
        if let Some((id, m)) = loi.first() {
            let ten = ds.ho_so.iter().find(|h| &h.id == id).map(|h| h.ten.as_str()).unwrap_or(id);
            return Err(format!("Không đọc được {} hồ sơ (ví dụ \"{ten}\": {m}). Phần đã quét đã được lưu, bấm xuất lại để quét tiếp.", loi.len()));
        }
    }
    xuat(dich, ds, &kho.ds)?;
    Ok(dich.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn nhieu(v: Vec<serde_json::Value>) -> Vec<serde_json::Value> { v }

    #[test]
    fn tom_tat_tinh_theo_cach_bieu_01() {
        let (b1, a1, c1) = (nhieu(vec![json!({"G": 1904}), json!({"G": "952,5"})]), nhieu(vec![json!({}), json!({})]), nhieu(vec![json!({})]));
        let a2 = nhieu(vec![json!({"E": "Kế hoạch"}), json!({"E": "  "}), json!({"E": null})]);
        let c3 = nhieu(vec![json!({"B": "PP1", "G": 9, "H": 2, "I": 7, "J": 2}), json!({"B": "PP2", "G": "1,5", "H": 9, "I": 7, "J": 1}), json!({"B": "PP3", "G": 9, "H": 9, "I": 4, "J": null})]);
        let d2 = nhieu(vec![json!({"B": 2027, "C": 3}), json!({"B": "2027", "C": 1}), json!({"B": 2028, "C": 2}), json!({"B": null, "C": 9})]);
        let s = tom_tat("x", &CacBieu { b1: &b1, c3: &c3, d2: &d2, a1: &a1, a2: &a2, c1: &c1 });
        assert_eq!((s.nhiem_vu, s.cong_viec, s.san_pham, s.vtvl), (2, 3, 1, 1));
        assert_eq!(s.gio_b1, 2856.5);
        assert_eq!(s.c3, 3.0);
        assert_eq!(s.nhu_cau, 2.0 + 1.5 + 4.0);
        assert_eq!(s.d2.get(&2027), Some(&4.0));
        assert_eq!(s.d2.len(), 2);
    }

    #[test]
    fn nam_thieu_chi_xet_2028_den_2031_va_bo_don_vi_trong() {
        let t = |c3: f64, d2: [f64; 5]| Tong { so_ho_so: 1, c3, d2, ..Tong::default() };
        assert_eq!(nam_thieu(&t(10.0, [10.0, 0.0, 0.0, 0.0, 0.0])), vec![2028, 2029, 2030, 2031]);
        assert!(nam_thieu(&t(10.0, [0.0, 5.0, 5.0, 5.0, 5.0])).is_empty());
        assert_eq!(nam_thieu(&t(10.0, [10.0, 5.0, 0.0, 5.0, 5.0])), vec![2029]);
        assert!(nam_thieu(&t(0.0, [0.0; 5])).is_empty());
    }

    #[test]
    fn nhan_ra_ubnd_xa_phuong_dac_khu() {
        assert!(la_ubnd_co_so("Ủy ban nhân dân xã Đồng Thái"));
        assert!(la_ubnd_co_so("Ủy ban nhân dân phường Lê Hồ"));
        assert!(!la_ubnd_co_so("Ủy ban nhân dân và Chủ tịch Ủy ban nhân dân tỉnh Ninh Bình"));
        assert!(!la_ubnd_co_so("Sở Y tế"));
    }

    /// Tạo tệp từ dữ liệu đã có (không gọi cổng): VTVL_CACHE=<quan-tri.json> VTVL_KHO=<kho.json> VTVL_RA=<ra.xlsx> cargo test xuat_tu_tep -- --ignored
    #[test]
    #[ignore]
    fn xuat_tu_tep() {
        let (c, k, r) = (std::env::var("VTVL_CACHE").unwrap(), std::env::var("VTVL_KHO").unwrap(), std::env::var("VTVL_RA").unwrap());
        let ds: DanhSach = crate::lo::doc_json(std::path::Path::new(&c)).unwrap();
        let kho: KhoSoLieu = crate::lo::doc_json(std::path::Path::new(&k)).unwrap();
        xuat(std::path::Path::new(&r), &ds, &kho.ds).unwrap();
    }
}
