import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, loiThanhChuoi } from '../api';
import { dinhDangCapNhat } from '../tongQuan';
import { KHOA_UU_TIEN, nhanBieu, sapTab } from '../quanTri';
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

  // mở tab nào thì đọc biểu đó (một lần)
  useEffect(() => {
    if (bieu && bieu.some((b) => b.khoa === tab) && !da[tab]) void taiBieu(tab);
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
