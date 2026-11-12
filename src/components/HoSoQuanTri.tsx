import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, loiThanhChuoi } from '../api';
import { dinhDangCapNhat } from '../tongQuan';
import { dinhDangTong, GIO_MOT_NGUOI_NAM, KHOA_UU_TIEN, nhanBieu, NGUONG_LECH_KHOP, sapTab, soSanhNguoi } from '../quanTri';
import type { DuLieuBieuQt, HoSoQt, TomTatBieuQt } from '../types';
import { BangBieu } from './BangBieu';
import { IcCanhBao, IcLamMoi, IcNguoi } from './Icons';

const NHAN_TRANG_THAI: Record<string, string> = { DRAFT: 'Đang kê khai', SUBMITTED: 'Đã nộp', RETURNED: 'Bị trả lại', APPROVED: 'Đã duyệt' };

export interface HoSoQuanTriProps {
  hoSo: HoSoQt;
  /** Mở thẻ đơn vị (hỏi tài khoản và mật khẩu nếu đơn vị chưa có trong lô). */
  onQuanTri: (hoSo: HoSoQt) => void;
}

type TaiBieu = { loai: 'dang_tai' } | { loai: 'loi'; thongBao: string } | { loai: 'xong'; du: DuLieuBieuQt };

/** Chi tiết một hồ sơ: đầu trang tóm tắt và mỗi biểu một tab. B1, C3, D2 đứng đầu và nổi bật để thẩm định. Chỉ đọc. */
export function HoSoQuanTri({ hoSo, onQuanTri }: HoSoQuanTriProps) {
  const [bieu, setBieu] = useState<TomTatBieuQt[] | null>(null);
  const [loiBieu, setLoiBieu] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(KHOA_UU_TIEN[0]);
  const [da, setDa] = useState<Record<string, TaiBieu>>({});
  const lanTai = useRef(0);

  const taiBieu = useCallback(async (khoa: string) => {
    const lan = lanTai.current;
    setDa((d) => ({ ...d, [khoa]: { loai: 'dang_tai' } }));
    try {
      const du = await api.qtBieu(hoSo.id, khoa);
      if (lan === lanTai.current) setDa((d) => ({ ...d, [khoa]: { loai: 'xong', du } }));
    } catch (e) {
      if (lan === lanTai.current) setDa((d) => ({ ...d, [khoa]: { loai: 'loi', thongBao: loiThanhChuoi(e) } }));
    }
  }, [hoSo.id]);

  // đổi hồ sơ: bỏ dữ liệu cũ, đọc lại danh sách biểu
  useEffect(() => {
    const lan = ++lanTai.current;
    setBieu(null); setLoiBieu(null); setDa({}); setTab(KHOA_UU_TIEN[0]);
    api.qtChiTiet(hoSo.id)
      .then((b) => { if (lan === lanTai.current) setBieu(b); })
      .catch((e) => { if (lan === lanTai.current) setLoiBieu(loiThanhChuoi(e)); });
  }, [hoSo.id]);

  // đọc biểu của tab đang mở, cùng B1 và C3 (để đầu trang so sánh số người) — mỗi biểu một lần
  useEffect(() => {
    if (!bieu) return;
    for (const k of new Set([tab, 'b1', 'c3'])) {
      if (bieu.some((b) => b.khoa === k) && !da[k]) void taiBieu(k);
    }
  }, [bieu, tab, da, taiBieu]);

  const { uuTien, khac } = bieu ? sapTab(bieu) : { uuTien: [], khac: [] };
  const moi = [...uuTien, ...khac];

  function phimTab(e: KeyboardEvent<HTMLDivElement>) {
    const i = moi.findIndex((b) => b.khoa === tab);
    const di = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!di || i < 0) return;
    e.preventDefault();
    const b = moi[(i + di + moi.length) % moi.length];
    setTab(b.khoa);
    document.getElementById(`tab-${b.khoa}`)?.focus();
  }

  const nut = (b: TomTatBieuQt, nhanh: boolean) => (
    <button key={b.khoa} id={`tab-${b.khoa}`} type="button" role="tab" aria-selected={tab === b.khoa} aria-controls={`bang-${b.khoa}`} tabIndex={tab === b.khoa ? 0 : -1}
      className={`tab${nhanh ? ' tab--uu-tien' : ''}${tab === b.khoa ? ' tab--chon' : ''}`} title={b.tieuDe} onClick={() => setTab(b.khoa)}>
      {nhanBieu(b, moi)}
      <span className="tab__dem">{b.soDong}</span>
      {b.dongChuaDat > 0 && <span className="tab__chua-dat" title={`${b.dongChuaDat} dòng chưa đạt`}>{b.dongChuaDat}</span>}
    </button>
  );
  const hienTai = da[tab];
  const b1 = da.b1;
  const c3 = da.c3;
  const soSanh = b1?.loai === 'xong' && c3?.loai === 'xong' ? soSanhNguoi(b1.du.dong, c3.du.dong) : null;
  const bieuChon = moi.find((b) => b.khoa === tab);

  return (
    <section className="hsqt" aria-label={`Hồ sơ ${hoSo.ten}`}>
      <header className="hsqt__dau">
        <div>
          <h2>{hoSo.ten}</h2>
          <p className="hsqt__phu">
            <code>{hoSo.ma}</code> · {NHAN_TRANG_THAI[hoSo.trangThai] ?? hoSo.trangThai} · tiến độ <b>{hoSo.tienDo}%</b> · cập nhật {dinhDangCapNhat(hoSo.capNhat)}
          </p>
          <p className="hsqt__phu">Tài khoản: {hoSo.taiKhoan.length ? hoSo.taiKhoan.map((t) => <code key={t}>{t}</code>) : <i>chưa có tài khoản gắn với đơn vị này</i>}</p>
        </div>
        <div className="hsqt__nut">
          <button type="button" className="nut" onClick={() => { if (bieuChon) void taiBieu(bieuChon.khoa); }} disabled={!bieuChon || hienTai?.loai === 'dang_tai'} title="Đọc lại biểu đang xem từ cổng">
            <IcLamMoi /> Tải lại biểu
          </button>
          <button type="button" className="nut nut--chinh" onClick={() => onQuanTri(hoSo)}
            title="Mở thẻ đơn vị: đăng nhập, Excel, chuẩn bị, gửi… (đơn vị chưa có trong lô thì nhập tài khoản và mật khẩu)">
            <IcNguoi /> Quản trị
          </button>
        </div>
        <SoSanhB1C3 soSanh={soSanh} dangTai={bieu !== null && (b1?.loai === 'dang_tai' || c3?.loai === 'dang_tai' || !b1 || !c3)} />
      </header>

      {loiBieu && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loiBieu}</p>}
      {!bieu && !loiBieu && <p className="hsqt__trang" role="status"><span className="quay" aria-hidden="true" /> Đang đọc danh sách biểu…</p>}

      {bieu && (
        <>
          <div className="tab-dai" role="tablist" aria-label="Các biểu của hồ sơ" onKeyDown={phimTab}>
            <span className="tab-dai__nhom">Thẩm định</span>
            {uuTien.map((b) => nut(b, true))}
            {khac.length > 0 && <span className="tab-dai__nhom tab-dai__nhom--khac">Biểu khác</span>}
            {khac.map((b) => nut(b, false))}
          </div>
          <div id={`bang-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={hienTai?.loai === 'dang_tai'} className="hsqt__noi-dung">
            {bieuChon && <p className="hsqt__tieu-de-bieu">{bieuChon.ma} · {bieuChon.tieuDe}</p>}
            {(!hienTai || hienTai.loai === 'dang_tai') && <p className="hsqt__trang" role="status"><span className="quay" aria-hidden="true" /> Đang đọc biểu từ cổng…</p>}
            {hienTai?.loai === 'loi' && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{hienTai.thongBao}</p>}
            {hienTai?.loai === 'xong' && <BangBieu du={hienTai.du} />}
          </div>
        </>
      )}
    </section>
  );
}

interface SoSanhB1C3Props {
  soSanh: ReturnType<typeof soSanhNguoi> | null;
  dangTai: boolean;
}

/** Dải so sánh trên đầu hồ sơ: số người ước tính từ B1 (tổng giờ ÷ 1.904) với tổng "Người cần bố trí" ở C3, trên toàn bộ dòng hai biểu. */
function SoSanhB1C3({ soSanh, dangTai }: SoSanhB1C3Props) {
  if (!soSanh) {
    return <p className="ss ss--cho" role="status">{dangTai ? <><span className="quay" aria-hidden="true" /> Đang đọc B1 và C3 để so sánh số người…</> : 'Chưa so sánh được: không đọc được B1 hoặc C3 của hồ sơ này.'}</p>;
  }
  const { nguoiB1, nguoiC3, chenh, tyLe, muc, gioB1 } = soSanh;
  const lonNhat = Math.max(nguoiB1, nguoiC3, 1e-9);
  const dau = chenh > 0 ? '+' : chenh < 0 ? '−' : '';
  const phanTram = tyLe === null ? null : Math.abs(tyLe - 1) * 100;
  const ketLuan = muc === null ? 'C3 chưa có người cần bố trí' : muc === 'khop' ? `Khớp (lệch ≤ ${NGUONG_LECH_KHOP * 100}%)` : chenh > 0 ? `B1 cao hơn C3 ${dinhDangTong(phanTram ?? 0, 1)}%` : `B1 thấp hơn C3 ${dinhDangTong(phanTram ?? 0, 1)}%`;
  return (
    <div className={`ss${muc === 'khop' ? ' ss--khop' : muc === 'lech' ? ' ss--lech' : ''}`} role="group" aria-label="So sánh số người ước tính B1 với người cần bố trí C3">
      <p className="ss__tieu-de">So sánh B1 ↔ C3</p>
      <dl className="ss__so">
        <div title={`Tổng giờ B1 (cột G) ${dinhDangTong(gioB1)} ÷ ${GIO_MOT_NGUOI_NAM.toLocaleString('vi-VN')}`}>
          <dt>B1 ước tính</dt>
          <dd>{dinhDangTong(nguoiB1)} <small>người</small></dd>
          <span className="ss__thanh" aria-hidden="true"><i className="ss__thanh--b1" style={{ width: `${(nguoiB1 / lonNhat) * 100}%` }} /></span>
        </div>
        <div title="Tổng cột J (Người cần bố trí) của C3">
          <dt>C3 cần bố trí</dt>
          <dd>{dinhDangTong(nguoiC3)} <small>người</small></dd>
          <span className="ss__thanh" aria-hidden="true"><i className="ss__thanh--c3" style={{ width: `${(nguoiC3 / lonNhat) * 100}%` }} /></span>
        </div>
        <div>
          <dt>Chênh lệch (B1 − C3)</dt>
          <dd className="ss__chenh">{dau}{dinhDangTong(Math.abs(chenh))} <small>người{tyLe !== null ? ` · B1/C3 = ${dinhDangTong(tyLe)}` : ''}</small></dd>
          <span className="ss__ket-luan">{ketLuan}</span>
        </div>
      </dl>
    </div>
  );
}
