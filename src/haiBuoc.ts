/** Xác nhận hai lần bấm cho thao tác không hoàn tác được (thay cho việc gõ chuỗi xác nhận). Phần thuần để kiểm thử. */

/** Chống bấm đúp: lần bấm thứ hai trong khoảng này sau lần đầu không tính. */
export const CHO_BAM_LAI_MS = 500;
/** Sau khoảng này không bấm lần hai thì thôi, quay về trạng thái ban đầu. */
export const HET_HAN_MS = 5000;

/** `daSanSangLuc`: thời điểm bấm lần đầu (`null` nếu chưa). Lần bấm hiện tại chỉ tính là lần hai khi đã qua `CHO_BAM_LAI_MS` và chưa quá `HET_HAN_MS`. */
export function laLanBamThuHai(daSanSangLuc: number | null, bayGio: number): boolean {
  if (daSanSangLuc === null) return false;
  const troiQua = bayGio - daSanSangLuc;
  return troiQua >= CHO_BAM_LAI_MS && troiQua <= HET_HAN_MS;
}
