# UI Reference - Trustfall

Nguồn tham chiếu: bộ Airbnb Web trên Mobbin (632 màn, 151 luồng) và bộ Zillow.

**Nguyên tắc gộp:** lấy **cấu trúc luồng** của Airbnb, lấy **gu nhìn** của skill
`minimalist-ui` (đơn sắc ấm, tương phản bằng chữ, phẳng, không gradient, không
đổ bóng nặng). Đừng bê nguyên vẻ ngoài Airbnb, nó nhiều ảnh và bo tròn, nặng máy
và trông như hàng nhái.

---

## 1. Cảnh báo đầu tiên: đừng copy độ dài luồng

Luồng đăng nhà của Airbnb: `Listing a home` 20 màn, `Setting up a home` 15 màn,
`Adding photos and amenities` 8 màn. Cộng lại hơn 40 màn chỉ để đăng một tin.

Họ làm được vì host kiếm tiền thật nên chịu ngồi. Owner trong demo của bạn thì
không. **Trustfall gói lại còn 3 bước:**

1. Chọn danh mục, nhập tiêu đề, mô tả, giá theo ngày, tiền cọc
2. Tải 2 ảnh, xem AI kiểm duyệt trả kết quả
3. Xem trước rồi đăng

Nếu thấy mình đang vẽ màn thứ tư thì dừng lại, gộp bớt.

---

## 2. Luồng nào bê về, luồng nào bỏ

**Bê về, đúng cái mình cần:**

| Luồng Airbnb | Dùng cho Trustfall |
|---|---|
| Searching homes, Filtering homes | Trang tìm kiếm, filter Category |
| Home details, Home photo gallery | Trang chi tiết món đồ |
| Reserving a home | Renter gửi yêu cầu thuê |
| Compare to similar listings | Gợi ý giá cho owner (xem mục 4) |
| Adding check-in method, Adding checkout instructions | Hướng dẫn QR check-in và check-out |
| Publishing a listing | Bước cuối của luồng đăng |
| Reviews, Sorting reviews | Review hai chiều |
| Conversation detail | Chat giữa hai bên |
| Reservation detail, Canceling a reservation | Trang chi tiết đơn thuê của renter |

**Bỏ, đừng nhìn tới:**
Switching to map view, Wishlist voting, Creating a guidebook, Find co-host,
Turning on smart pricing, Applying a promotion, Gift cards, Joining Airbnb for
Work, Host passport, Connect a calendar.

Toàn thứ chỉ có nghĩa khi đã có hàng nghìn người dùng.

---

## 3. Bố cục ba trang xương sống

**Trang tìm kiếm.** Lưới thẻ, mỗi thẻ một ảnh, tên, giá theo ngày, điểm review.
Filter nằm thành hàng ngang phía trên, không giấu trong drawer. Không map.

**Trang chi tiết.** Ảnh lớn bên trái, khối đặt thuê dính bên phải (giá, chọn
ngày, tiền cọc, nút Thuê). Mô tả, đánh giá, thông tin owner xếp dọc bên dưới.
Khối bên phải phải dính khi cuộn, đây là chi tiết Airbnb làm rất tốt và nó đẩy
tỉ lệ bấm nút lên rõ rệt.

**Trang đơn thuê.** Trạng thái hiện thành một dải ngang: Đã yêu cầu, Đã duyệt,
Đang thuê, Đã trả, Hoàn tất. Đồng hồ đếm ngược tới lúc nhả cọc đặt ngay dưới
dải đó, chữ to, không giấu.

---

## 4. Món hay nhất nhặt được: Compare to similar listings

Airbnb có sẵn một luồng tên `Compare to similar listings` nằm trong nhóm
`Setting up prices and security details`. Đây chính là tính năng gợi ý giá bạn
muốn, và họ giải đúng cách bạn cần: **không dùng AI đoán, mà chiếu giá của các
tin tương tự để owner tự so.**

Bê nguyên về: dưới ô nhập giá, hiện một dòng kiểu "5 món cùng danh mục đang cho
thuê 12 tới 20 USDC mỗi ngày", số lấy từ trung vị các listing cùng category
trong Supabase. Không câu chữ tư vấn, không AI. Rẻ, chạy được, và đúng thật.

---

## 5. Nhẹ máy

Máy bạn RTX 3050 4GB, và giám khảo chấm demo trên laptop bất kỳ. Ưu tiên nhẹ hơn
ưu tiên đẹp.

- Mỗi vật đúng 2 ảnh, không gallery cuộn ngang
- Dùng `next/image` với `sizes` khai đúng, để nó tự sinh bản nhỏ
- Ảnh dưới màn hình đầu để `loading="lazy"`
- Không carousel tự chạy, không parallax, không video nền, không thư viện
  animation cho phần app. Animation chỉ dùng ở landing page
- Danh sách listing phân trang, không cuộn vô tận
- Skeleton khi chờ tải, đừng để layout nhảy

---

## 6. Chỗ Airbnb làm mà mình cố tình làm khác

Airbnb giấu tổng tiền tới bước cuối. Đừng bắt chước, họ bị chửi nhiều năm vì
chuyện này và đang phải sửa. Trustfall hiện đủ ngay trên trang chi tiết: tiền
thuê, tiền cọc, phí nền tảng 1%, tổng phải trả. Minh bạch tiền vốn là lý do dự
án này tồn tại, nên phải thể hiện ra ở chỗ nhìn thấy được.

---

## Giới hạn của ghi chú này

Tài khoản Mobbin đang ở bản thường, có chắn Pro nên chỉ đọc được tên luồng, số
màn và ảnh thu nhỏ, không mở lớn từng màn. Ghi chú trên dựng từ cấu trúc luồng
chứ không phải từ soi chi tiết từng pixel. Muốn kỹ hơn thì mở Mobbin ra xem tận
mắt luồng `Reserving a home` và `Setting up prices and security details`, hai
cái đó đáng thời gian nhất.
