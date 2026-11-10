export const dinhDangSo = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Một nhóm chip vàng: nhãn biểu rồi tổng (C3 một chip, D2 mỗi năm một chip). */
export function TongNguoi({ ten, tong }: { ten: string; tong: Record<string, number> | undefined }) {
  const ds = tong ? Object.entries(tong).sort(([a], [b]) => a.localeCompare(b)) : [];
  if (ds.length === 0) return null;
  return (
    <span className="tong-nhom">
      <span className="tong-nhom__ten">{ten}</span>
      {ds.map(([nam, v]) => <mark key={nam} className="tong-nguoi"><i>{nam || 'Σ'}</i>{dinhDangSo(v)}</mark>)}
    </span>
  );
}

