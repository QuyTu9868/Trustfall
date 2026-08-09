# ERROR.md

Sổ ghi lỗi và thiếu sót của Claude trong lúc code. Không giới hạn ở Trustfall, ghi cả
những thứ đúng cho mọi dự án.

**Đây là kho nguyên liệu, không phải luật.** Thứ thực sự điều khiển hành vi là
`CLAUDE.md` và các skill trong `~/.claude/skills/`.

## Khi nào ghi, khi nào đọc

**Ghi:** mỗi lần git commit. Trước khi commit, nhìn lại đoạn việc vừa làm rồi thêm entry
cho những lỗi và thiếu sót đã mắc trong đoạn đó. Commit xong không có gì đáng ghi thì
ghi một dòng "không có" cũng được, đừng bịa entry cho đầy.

**Đọc:** chỉ khi user yêu cầu. Không tự mở file này ra đọc ở đầu phiên hay giữa lúc
đang code. Nó là sổ ghi, không phải chỉ thị, và đọc nó mỗi phiên chỉ tốn chỗ.

**Tổng hợp:** khi user kêu, đọc cả file, gom entry theo skill đích, sửa skill thật, rồi
chuyển entry đã xử xuống mục 5. Entry đã gấp vào skill mà vẫn để nguyên chỗ cũ thì chỉ
là chữ nằm im.

---

## Cách ghi một entry

```
### [ngày] Tiêu đề ngắn
- Chuyện gì xảy ra:
- Sai ở đâu:
- Luật rút ra:
- Skill đích:
```

Bốn dòng, không dài hơn. Entry dài thì không ai đọc lại.

---

## 1. Ranh giới quyết định: tự làm hay phải hỏi

### [2026-07-29] Dừng chờ duyệt cho một dòng config, mất một ngày

- **Chuyện gì xảy ra:** Đang dựng checkpoint 0, `npx hardhat compile` chết vì
  OpenZeppelin 5.6 dùng lệnh `mcopy` mà Hardhat mặc định nhắm bản EVM cũ hơn. Claude
  chẩn đoán đúng nguyên nhân, đề xuất đúng cách sửa (ghim `evmVersion: "cancun"`), rồi
  **dừng lại chờ user duyệt**. User bận, một ngày sau mới trả lời.
- **Sai ở đâu:** Áp quy tắc 3.3 "chẩn đoán trước khi sửa" vào sai loại lỗi. Quy tắc đó
  sinh ra để chống thói đoán mò rồi sửa đại khi **user báo lỗi**. Còn đây là lỗi Claude
  tự gây ra trong lúc build, chỉ có đúng một đáp án, không đổi thiết kế, không đổi phạm
  vi, không ảnh hưởng tiền hay bảo mật.
- **Luật rút ra:** Quy tắc 3.3 áp cho lỗi **user báo**, hoặc lỗi mà cách sửa làm đổi
  thiết kế, đổi phạm vi, đụng tới tiền hoặc khoá. Lỗi build tự gặp trong lúc dựng thì
  chẩn đoán, sửa luôn, báo lại trong report kèm nguyên nhân gốc. Không dừng chờ duyệt.
- **Skill đích:** `code-change-workflow` (thêm mục "lỗi nào không cần chờ duyệt")

### [2026-07-30] Cùng một loại lỗi, xử theo hai cách khác nhau

- **Chuyện gì xảy ra:** Cũng trong checkpoint 0, trang web trả HTTP 500 vì RainbowKit
  lôi theo `@coinbase/cdp-sdk` làm Turbopack không resolve được. Lần này Claude chẩn
  đoán, sửa luôn bằng một dòng `serverExternalPackages`, báo trong report. Không hỏi.
- **Sai ở đâu:** Cách xử lần này đúng, nhưng nó **lệch với ca `mcopy` hôm trước** dù hai
  ca cùng loại. Bản thân sự bất nhất mới là lỗi: user không đoán được lần sau Claude sẽ
  dừng hay chạy tiếp.
- **Luật rút ra:** Chọn một lằn ranh rồi giữ nguyên. Lằn ranh chốt ở entry trên. Khi
  không chắc entry nào áp dụng thì nói rõ trong report là mình đã tự quyết và quyết
  theo căn cứ nào, đừng im.
- **Skill đích:** `code-change-workflow`

### [2026-07-30] Ca tự quyết đúng, để làm mốc so sánh

- **Chuyện gì xảy ra:** `npm install wagmi` kéo về wagmi 3, nhưng RainbowKit bản mới
  nhất chỉ đỡ wagmi `^2.9.0`. Claude tự hạ wagmi về v2 rồi báo lại, không hỏi trước.
- **Sai ở đâu:** Không sai. Ghi lại để làm mốc: giữ RainbowKit thì không có phương án
  nào khác, mà RainbowKit là stack đã chốt trong `CLAUDE.md`. Không có gì để user chọn.
- **Luật rút ra:** Khi thực tế chỉ còn một đường đi, tự đi rồi báo. Chỉ hỏi khi có từ
  hai phương án mà chọn khác nhau ra kết quả khác nhau.
- **Skill đích:** không cần sửa skill, đây là mốc tham chiếu

---

## 2. Lỗi hành vi lặp lại

Chỗ này ghi những thói lặp đi lặp lại: gộp checkpoint khi luật bắt tách, sửa triệu
chứng thay vì nguyên nhân, tự thêm tính năng ngoài yêu cầu, báo "xong" khi chưa test.

### [2026-08-02] Bỏ qua skill bắt buộc suốt cả buổi, user phải nhắc mới chạy

- **Chuyện gì xảy ra:** CLAUDE.md mục 3.3 và mục 10 ghi `code-change-workflow` là **bắt
  buộc mỗi lần** user báo lỗi hoặc xin thêm bớt đổi chức năng. Đi qua hàng chục lượt sửa
  trong ngày mà không chạy nó lần nào. User phải nói "bạn quên 1 bước, check lại skill đi".
- **Sai ở đâu:** Coi luật bắt buộc là thứ để nhớ trong lúc làm. Hậu quả cụ thể: nhảy thẳng
  vào code mà bỏ Bước 0 nhắc lại ý hiểu, nên có lần làm xong user mới nói "sửa lại thành
  review bên cạnh, chat ở dưới" - đúng loại lãng phí mà Bước 0 sinh ra để chặn.
- **Luật rút ra:** Chữ "bắt buộc" trong CLAUDE.md phải được kiểm ở **đầu lượt**, trước khi
  đọc file đầu tiên, không phải nhớ tới đâu làm tới đó. Cụ thể: user nhắn có chứa báo lỗi
  hoặc yêu cầu đổi chức năng thì lệnh đầu tiên là gọi skill, không phải Grep.
- **Skill đích:** `dapp-build-router`, `code-change-workflow`

### [2026-08-02] Sửa một chỗ đọc nhầm đồng hồ, không quét các chỗ còn lại

- **Chuyện gì xảy ra:** Sáng sửa đồng hồ đếm ngược vì nó đọc giờ máy trong khi contract xét
  `block.timestamp`. Trưa script seed chết vì đúng lỗi đó. Tối hạn chữ ký permit cũng đúng
  lỗi đó, và lần này **chặn hẳn việc thuê**, hiện ra dưới dạng lỗi thiếu hạn mức token khó
  hiểu. Ba lần sửa lẻ trong một ngày cho cùng một loại sai.
- **Sai ở đâu:** Sửa đúng chỗ được báo rồi dừng, không hỏi "chỗ nào khác cũng đọc sai
  nguồn như thế". Loại sai này không đứng một mình bao giờ.
- **Luật rút ra:** Sửa xong một lỗi thì **quét cả họ ngay trong lượt đó**, bằng grep chứ
  không bằng trí nhớ. Ở đây là `Date.now()` trong mọi chỗ so với thứ contract xét. Nguyên
  tắc chung: mọi hạn chót do contract quyết phải đo bằng giờ chain.
- **Skill đích:** `code-change-workflow`, `vibe-code-dapp`

### [2026-08-01] Lặp lại đúng lỗi vừa tự ghi vào file này vài giờ trước

- **Chuyện gì xảy ra:** Sáng ghi entry "viết một assert luôn đúng rồi tính nó là test đã
  qua". Chiều viết script test cho checkpoint sau, lại đặt `check("chủ đơn được vào",
  true)`. Vẫn in PASS, vẫn cộng vào tổng, vẫn suýt báo cáo là đã kiểm.
- **Sai ở đâu:** Ghi ra không đồng nghĩa với nhớ. Luật hiện hành là chỉ ghi ERROR.md lúc
  commit và chỉ đọc khi được yêu cầu, nên file này không hề nằm trong tầm mắt lúc đang
  code, tức là nó không chặn được gì trong lượt đang chạy.
- **Luật rút ra:** Những lỗi thuộc loại "viết ra rồi vẫn tái phạm" phải được biến thành
  thứ tự chặn, không phải thứ để nhớ: một dòng lint, một helper `check` từ chối tham số
  là hằng số, hoặc một bước rà lại trước khi báo cáo. Ghi chú chỉ hữu ích khi nâng cấp
  skill, không hữu ích khi đang gõ.
- **Skill đích:** `contract-test-audit`

### [2026-08-01] Phá luật cứng nhất của dự án ngay trên màn hình, suốt bốn checkpoint

- **Chuyện gì xảy ra:** CLAUDE.md mục 3.1 cấm dấu gạch dài trong mọi thứ, gồm cả chuỗi
  hiển thị. Dải trạng thái đơn thuê và dải ba bước trang đăng tin nối các mốc bằng
  `&mdash;`, tức là gạch dài hiện thẳng cho người dùng nhìn, từ checkpoint 4 tới 8.
- **Sai ở đâu:** Kiểm luật đó ở phần văn xuôi mình gõ ra, nhưng không kiểm ở **HTML
  entity** trong code. `&mdash;` không trông giống dấu gạch dài khi đọc code, nên nó lọt
  qua mọi lần đọc lại.
- **Luật rút ra:** Luật về ký tự phải soát ở dạng đã render, không phải dạng nguồn. Grep
  cả entity lẫn ký tự thật (`&mdash;`, `&#8212;`, `—`). Và khi cần một gạch nối trong
  giao diện thì vẽ bằng CSS chứ đừng gõ ký tự, vừa đúng luật vừa nhìn gọn hơn.
- **Skill đích:** `minimalist-ui`

### [2026-07-30] Cắt output bằng `tail` nên không thấy cảnh báo ở đầu

- **Chuyện gì xảy ra:** Suốt checkpoint 0, mỗi lần chạy `forge test` và `hardhat compile`
  đều xem kết quả bằng `| tail -8` hoặc `| tail -25` cho gọn. Đầu output có một dòng
  `ERROR foundry_compilers::cache: invalid type: sequence, expected a map` bị cắt mất.
  Tới checkpoint 1 tình cờ xem output dài hơn mới thấy, hoá ra Hardhat và Foundry đang
  đè cache của nhau.
- **Sai ở đâu:** Báo cáo "xanh hết" dựa trên phần cuối output. Cảnh báo và lỗi
  không nghiêm trọng thường nằm ở **đầu** output, đúng chỗ `tail` cắt đi. Test pass mà
  vẫn có cảnh báo là chuyện thường.
- **Luật rút ra:** Lần chạy đầu tiên của một công cụ trong dự án thì xem **toàn bộ**
  output, không cắt. Về sau muốn gọn thì lọc theo từ khoá (`grep -E "ERROR|error|warning|
  Compiling|passed|failed"`) chứ đừng cắt theo vị trí. Cắt theo vị trí là cắt mù.
- **Skill đích:** `contract-test-audit`, `vibe-code-dapp`

### [2026-07-30] Liệt kê tên file bí mật thay vì chặn cả họ

- **Chuyện gì xảy ra:** `.gitignore` viết `.env`, `.env.local`, `.env*.local`. User tự
  tạo `.env.test` chứa private key ví test. Ba mẫu trên không khớp tên đó, nên file khoá
  nằm trong danh sách sắp commit lên một repo GitHub công khai. Bắt được ở bước quét
  cuối, chỉ cách một lệnh `git commit`.
- **Sai ở đâu:** Với file bí mật, liệt kê tên cụ thể là chặn theo danh sách cho phép
  ngược. Chỉ cần một tên không nghĩ ra là lọt, mà lọt private key thì không cứu được
  bằng cách xoá commit sau.
- **Luật rút ra:** File bí mật thì chặn cả họ trước rồi mở lại ngoại lệ:
  `.env*` rồi `!.env.example`, `!.env*.example`. Nguyên tắc chung: cái gì lọt ra là
  không thu hồi được thì mặc định chặn, đừng mặc định cho qua. Và luôn quét tên file
  cùng nội dung trước commit đầu tiên của một repo.
- **Skill đích:** `vibe-code-dapp` (bước dựng repo), `deploy-verify-contract` (phần
  an toàn private key)

### [2026-08-09] Lặp lại đúng lỗi "test route phá huỷ bằng dữ liệu thật", lần này mất dữ liệu
- **Chuyện gì xảy ra:** Đang kiểm xem đăng xuất rồi có bị chặn không, mình gửi
  `DELETE /api/admin/records?rentalId=5` với niềm tin nó sẽ trả 401. Nó trả 200 và xoá
  thật: phán quyết, hai lời khai, ảnh đèn xe vỡ, đoạn chat của đơn Civic vừa dựng xong.
  Năm bước ngay trước đó mình đã dùng id rác `999901`, tới ca cuối thì quên.
- **Sai ở đâu:** Cùng một lỗi đã tự ghi vào file này ngày 2026-08-08 cho route ký, chỉ
  đổi đối tượng. Gốc rễ là **đặt kỳ vọng "cái này sẽ bị chặn" rồi lấy kỳ vọng đó làm
  giấy phép dùng dữ liệu thật**. Mà chính vì nghi nó không chặn nên mới phải test.
- **Luật rút ra:** Với route xoá hoặc ký, **id rác là mặc định, không phải lựa chọn**.
  Một ca kiểm cổng chặn không cần đối tượng có thật: 401 chặn trước mọi thứ, nên
  `rentalId=999902` chứng minh y hệt `rentalId=5`. Cụ thể hơn: khi một bộ ca đang chạy
  bằng id rác mà có một ca dùng id thật, đó là dấu hiệu ca đó viết sai, không phải ca đó
  đặc biệt.
- **Skill đích:** `code-change-workflow` (mục cân độ test)

### [2026-08-09] Đăng xuất không thu hồi được phiên, vì cookie tự xác thực
- **Chuyện gì xảy ra:** Gọi `DELETE /api/admin` để đăng xuất, rồi gửi tiếp request với
  đúng cookie cũ. Nó vẫn qua. Phát hiện tình cờ trong lúc test, không phải do tìm ra.
- **Sai ở đâu:** Cookie phiên là `{hạn}.{HMAC(hạn)}`, server không lưu gì. `cookies().delete()`
  chỉ bảo trình duyệt bỏ đi, không làm chuỗi đó mất giá trị. Ai giữ được bản sao thì dùng
  tiếp tới lúc hết hạn. Cái này vô hại khi `/admin` chỉ đọc, và thành lỗ hổng ngay lúc
  thêm nút xoá vào cùng trang, mà mình thêm nút xoá xong không rà lại tầng phiên.
- **Luật rút ra:** **Thêm quyền phá huỷ vào một trang thì phải xét lại cả tầng xác thực
  của trang đó**, không chỉ viết guard cho route mới. Và với phiên không trạng thái thì
  đừng hứa thu hồi: hoặc lưu trạng thái ở server, hoặc bắt xác thực lại ngay lúc hành
  động. Ở đây chọn cách hai, mỗi lệnh xoá và sửa phải kèm mã TOTP còn hiệu lực, nên
  cookie bị lộ đọc được log mà không xoá được gì.
- **Skill đích:** `vibe-code-dapp` (phần phiên đăng nhập), `dapp-production-checklist`

### [2026-08-08] Bảo user chạy Simulate ở trang khác trong khi latch chưa được lưu
- **Chuyện gì xảy ra:** Dựng xong 6 filter Latch, mình bảo user sang mục Simulate ở menu
  bên trái để kiểm trước rồi hãy Activate. Latch chỉ lưu khi bấm `Activate latch`, nên
  rời trang là mất trắng. User phải dựng lại từ đầu, gồm cả 11 rule gõ tay.
- **Sai ở đâu:** Chữ `unsaved` nằm ngay cạnh nút, mình nhìn nhiều lần mà không đọc. Mình
  suy ra thứ tự "kiểm trước, cam kết sau" từ thói quen chung, thay vì từ cái giao diện
  đang mở, nơi việc kiểm và việc lưu nằm ở hai trang khác nhau.
- **Luật rút ra:** Trong dashboard của người khác, **hỏi "công sức này đang nằm ở đâu"
  trước khi bảo user đi đâu đó**. Chưa thấy bằng chứng đã lưu (chữ unsaved biến mất, có
  id, có URL riêng) thì mọi thao tác điều hướng đều là rủi ro mất dữ liệu. Thứ tự đúng
  là lưu trước rồi mới kiểm, vì thứ đã lưu thì sửa lại được, còn thứ chưa lưu thì không.
- **Skill đích:** `latch-agent-gateway` (đã thêm mục "latch chưa được lưu cho tới khi
  bấm Activate")

---

## 3. Thiếu sót khi code

### [2026-07-30] Để Hardhat và Foundry dùng chung thư mục cache

- **Chuyện gì xảy ra:** Dựng `contracts/` cho cả hai công cụ nhưng không đặt
  `cache_path` cho Foundry. Cả hai mặc định ghi `cache/solidity-files-cache.json` với
  hai định dạng khác nhau, nên chạy công cụ nào là công cụ đó đè cache của công cụ kia,
  rồi lần sau bên kia đọc không hiểu, in ERROR và biên dịch lại từ đầu.
- **Sai ở đâu:** Dựng hai công cụ cùng thư mục mà không kiểm chúng có tranh đường dẫn
  nào không. Kết quả không sai, nhưng chậm và in ra dòng ERROR làm tưởng có lỗi thật.
- **Luật rút ra:** Đặt hai công cụ build vào cùng một thư mục thì đối chiếu **toàn bộ**
  đường dẫn mặc định của chúng, không chỉ thư mục source. Với Hardhat và Foundry, ít nhất
  phải đặt `cache_path = "cache_forge"` trong `foundry.toml`. Đường ra artifact thì
  Foundry dùng `out/`, Hardhat dùng `artifacts/`, hai cái này không trùng.
- **Skill đích:** `vibe-code-dapp`, `contract-test-audit`

### [2026-07-31] Quên rằng chain local giữ nguyên đồng hồ đã bị tua tới

- **Chuyện gì xảy ra:** Test luồng thuê, permit liên tục bị từ chối với
  `ERC20InsufficientAllowance` dù chữ ký dựng đúng. Nguyên nhân: mấy script trước đó đã
  `evm_increaseTime` nhiều ngày để thử timeout, và **chain giữ nguyên phần tua đó**. Hạn
  của permit tính từ `Date.now()` hoá ra nằm ở quá khứ so với `block.timestamp`, nên
  permit hết hạn ngay khi vừa ký.
- **Sai ở đâu:** Coi đồng hồ chain local là đồng hồ thật. Nó chỉ đúng cho tới lần tua đầu
  tiên, và sau đó **không bao giờ tự quay lại**. Lỗi lại hiện ra ở tận chỗ khác
  (allowance), nên mất một lúc mới lần được về nguyên nhân.
- **Luật rút ra:** Tua thời gian trên chain local là thao tác **một chiều**. Đã tua để
  test timeout thì **khởi động lại node** trước khi test bất cứ thứ gì có hạn tính từ giờ
  thật: permit, chữ ký QR, phiên đăng nhập. Khi gặp lỗi hết hạn khó hiểu, việc đầu tiên
  là so `block.timestamp` với `Date.now()`.
- **Skill đích:** `vibe-code-dapp`, `frontend-e2e-wallet`, `contract-test-audit`

### [2026-07-31] Phá đúng cái luật mình đã viết thành chú thích trong chính file đó

- **Chuyện gì xảy ra:** Thêm `requestRentalWithPermit`. Viết lời gọi `permit` lên đầu hàm
  vì đọc xuôi: "xin phép trước, rồi làm". Slither báo `reentrancy-benign` và
  `reentrancy-events`. Soi lại thì đúng: `permit` là **lời gọi ra ngoài**, mà mình đặt nó
  **trước** toàn bộ phần ghi state. Trong khi checks-effects-interactions là luật mình đã
  ghi rõ thành chú thích ở ngay file đó từ checkpoint 1.
- **Sai ở đâu:** Sắp xếp code theo thứ tự **kể chuyện cho dễ hiểu** thay vì theo thứ tự
  **an toàn**. Ở đây không khai thác được vì token là USDC không gọi ngược, nhưng lý do
  đó là may mắn về hoàn cảnh, không phải do mình cẩn thận.
- **Luật rút ra:** Trước khi commit một hàm mới trong contract, đọc lại nó một lượt và
  gạch chân **mọi lời gọi ra ngoài**, rồi kiểm chúng có nằm sau toàn bộ phần ghi state
  không. Có sẵn luật trong đầu không đủ, phải rà lại từng hàm mới, vì hàm mới là chỗ luật
  cũ dễ bị quên nhất.
- **Skill đích:** `vibe-code-dapp`, `contract-test-audit`

### [2026-07-31] Sửa code chứa ký tự escape bằng script lồng trong shell

- **Chuyện gì xảy ra:** Dùng heredoc shell chạy Python để chèn một khối test Solidity có
  chuỗi `"\x19\x01"`. Escape bị xử lý hai lần, nên file nhận **hai ký tự điều khiển thật**
  thay vì chuỗi escape. Compiler báo "Invalid character in string", và nhìn bằng mắt
  thường trong editor thì đoạn đó **trông vẫn bình thường**.
- **Sai ở đâu:** Chọn công cụ sai cho loại nội dung. Heredoc lồng script là ba tầng xử lý
  chuỗi chồng nhau, mà nội dung lại chính là chuỗi có escape.
- **Luật rút ra:** Nội dung có escape, ký tự đặc biệt, hay dấu ngoặc lồng nhau thì sửa
  bằng công cụ sửa file trực tiếp, đừng đẩy qua shell. Nếu buộc phải sinh bằng script thì
  dùng dạng không cần escape, như `hex"1901"` của Solidity. Và khi lỗi kiểu này xảy ra,
  soi bằng `cat -A` để thấy ký tự vô hình, vì đọc thường sẽ không thấy gì sai.
- **Skill đích:** `vibe-code-dapp`

### [2026-07-31] Code một đơn vị tính tiền mà chưa bao giờ hỏi nó nghĩa là gì

- **Chuyện gì xảy ra:** `CLAUDE.md` ghi "đơn vị thuê: theo ngày". Mình code luôn thành
  ngày lịch tính cả hai đầu (30 và 31 ra 2 ngày), viết test, chạy Slither, deploy. User
  bắt được: thu thừa một ngày. Sửa thành đếm theo đêm. User bắt tiếp: vẫn không đúng, một
  ngày phải là 24 tiếng kể từ lúc nhận đồ. Phải sửa contract **hai lần** cho cùng một
  dòng spec, lần sau nặng hơn lần trước.
- **Sai ở đâu:** "Theo ngày" nghe như đã đủ rõ nên mình không hỏi lại. Nhưng nó có ít
  nhất ba nghĩa khác nhau, mỗi nghĩa ra một số tiền khác nhau: ngày lịch tính cả hai đầu,
  số đêm, và số chu kỳ 24 tiếng. Chọn sai thì mọi thứ dựng lên trên nó đều sai theo, và
  càng dựng cao thì sửa càng đắt.
- **Luật rút ra:** Trước khi code bất kỳ **đơn vị tính tiền** nào, hỏi user nó nghĩa là
  gì bằng một ví dụ số cụ thể: "chọn 30 và 31 thì tính mấy ngày, trả bao nhiêu". Một câu
  hỏi có con số trong đó lộ ra ngay bất đồng, còn hỏi trừu tượng thì hai bên cùng gật rồi
  hiểu khác nhau. Áp cho mọi thứ đo đếm được: ngày, giờ, phần trăm, làm tròn, ai trả phí.
- **Skill đích:** `dapp-discovery`, `vibe-code-dapp`, `code-change-workflow`

### [2026-07-30] Viết spec về đường đi của tiền dựa vào trí nhớ thay vì đọc lại contract

- **Chuyện gì xảy ra:** Viết spec cho trang chi tiết, mô tả bảng chi phí là "tiền thuê +
  tiền cọc + **phí nền tảng 1%** = tổng phải trả". User duyệt spec đó. Tới lúc code, đọc
  lại `RentalEscrow` thì thấy sai: `requestRental` chỉ kéo `rent + deposit` từ renter,
  còn 1% phí **trừ vào phần owner nhận** lúc check-in. Renter không trả thêm đồng nào.
  Làm đúng spec thì giao diện sẽ báo giá cao hơn thực tế 1%.
- **Sai ở đâu:** Chính mình viết cái contract đó vài ngày trước, nên tin vào trí nhớ.
  Trí nhớ giữ được "có phí 1%" nhưng đánh rơi mất "phí trừ của ai". Với một dự án mà lý
  do tồn tại là minh bạch tiền, nói sai con số là hỏng đúng thứ đang bán.
- **Luật rút ra:** Mọi câu nói về **ai trả bao nhiêu cho ai** phải đọc lại đúng dòng code
  quyết định việc đó, kể cả code mình vừa viết. Trong spec, ghi kèm tên hàm chỗ lấy số
  (`requestRental` kéo `rent + deposit`) để người duyệt kiểm được, thay vì bắt họ tin.
  Test số tiền phải đối chiếu với contract, không đối chiếu với spec.
- **Skill đích:** `vibe-code-dapp`, `dapp-discovery`

### [2026-07-30] Chỉ kiểm những trạng thái dễ chạm tới, bỏ qua trạng thái quan trọng

- **Chuyện gì xảy ra:** Dựng form đăng tin có bước chọn ảnh. Chụp ảnh màn hình kiểm tra
  đúng như bài học hôm trước, thấy đẹp, báo cáo xong. User dùng thật thì lòi ra hai lỗi,
  **cả hai chỉ xuất hiện sau khi đã chọn ảnh**: ảnh xem trước bị `object-cover` cắt mất
  gần hết chỉ còn một góc, và ô chọn file nhận bao nhiêu ảnh cũng được vì `multiple` của
  HTML không có giới hạn số lượng.
- **Sai ở đâu:** Chụp đúng **màn hình rỗng** rồi coi như đã kiểm cả màn hình. Trạng thái
  rỗng là trạng thái dễ chạm tới nhất và ít thông tin nhất. Toàn bộ giá trị của màn đó
  nằm ở trạng thái **sau khi có dữ liệu**, mà mình chưa từng nhìn thấy nó lần nào.
- **Luật rút ra:** Liệt kê các trạng thái của màn hình trước khi kiểm: rỗng, đang tải,
  có dữ liệu, dữ liệu tràn hoặc quá nhiều, lỗi. Kiểm trạng thái **có dữ liệu** trước tiên
  vì nó là lý do màn hình đó tồn tại. Trạng thái nào không tự dựng được thì nói thẳng ra
  là chưa kiểm, đừng để nó lẫn vào phần đã kiểm.
- **Skill đích:** `minimalist-ui`, `design-taste-frontend`, `frontend-e2e-wallet`

### [2026-07-30] Xây cả một đường phụ thuộc vào tính năng chưa bật ở dịch vụ ngoài

- **Chuyện gì xảy ra:** Làm xác thực người đăng tin bằng identity token của Privy. Đọc
  kỹ file type của SDK, viết client lấy token, viết server xác minh token, test lộ trình
  từ chối (không token, token bịa) đều đúng. User bấm Publish thì token rỗng, dù đã đăng
  nhập thành công. Nguyên nhân: identity token **mặc định tắt**, phải tự bật một công tắc
  trong dashboard Privy. Không dòng code nào sai cả.
- **Sai ở đâu:** Đọc API của thư viện rồi tưởng là đã hiểu tính năng. File type mô tả
  **cách gọi**, nó không nói tính năng có cần bật ở phía dịch vụ hay không. Cái đó chỉ
  nằm trong tài liệu hướng dẫn. Mình bỏ qua bước đọc tài liệu vì đã có type.
- **Luật rút ra:** Trước khi xây một đường phụ thuộc vào tính năng của dịch vụ ngoài, đọc
  trang tài liệu của **chính tính năng đó**, không chỉ file type, và trả lời: nó có cần
  bật ở dashboard không, có cần khoá riêng không, có mặc định tắt không. Nếu cần bật thì
  **nói user bật trước**, rồi mới viết code. Kiểm sớm bằng một lời gọi thật, đừng để cả
  luồng xong mới phát hiện.
- **Skill đích:** `dapp-discovery`, `vibe-code-dapp`, `latch-agent-gateway`

### [2026-07-30] Thông báo lỗi mô tả triệu chứng và bảo user làm việc vô ích

- **Chuyện gì xảy ra:** Khi thiếu identity token, màn hình hiện "Still preparing your
  session. Try again in a moment." User bấm lại, vẫn hỏng. Bấm lại nữa, vẫn hỏng. Câu đó
  hứa rằng **chờ sẽ được**, trong khi chờ bao lâu cũng không bao giờ được, vì vấn đề nằm
  ở một công tắc chưa bật.
- **Sai ở đâu:** Viết thông báo theo thứ mình quan sát được ở trong code ("biến này đang
  rỗng") chứ không theo thứ user cần làm. Tệ hơn cả im lặng: im lặng thì user đi tìm
  nguyên nhân, còn câu này giữ chân họ trong một vòng lặp chắc chắn thất bại.
- **Luật rút ra:** Mỗi thông báo lỗi phải trả lời được **"giờ tôi phải làm gì"**. Không
  viết "đang chuẩn bị", "thử lại sau" trừ khi biết chắc là chờ thật sự có tác dụng. Khi
  chưa chắc nguyên nhân, nói ra cả hai khả năng kèm cách kiểm, còn hơn đoán một cái rồi
  hướng user đi sai. Đọc lại từng câu báo lỗi và hỏi: câu này làm user hành động đúng hay
  làm họ mất thời gian.
- **Skill đích:** `minimalist-ui`, `design-taste-frontend`, `vibe-code-dapp`

### [2026-07-30] Dựng xong giao diện mà chưa hề xem nó render ra sao

- **Chuyện gì xảy ra:** Dựng khung frontend checkpoint 3. Typecheck sạch, `next build`
  sạch, cả 4 route trả HTTP 200, `curl` thấy đúng chữ cần thấy. Coi như xong. Tới lúc
  chụp ảnh trang thật mới thấy **hai lỗi cùng lúc**: (1) chỗ giữ chỗ lúc Privy chưa khởi
  tạo là một ô rỗng có viền, trông y như ô input hỏng chứ không như trạng thái đang tải;
  (2) nút ghi "Mint 100 USDC" nhưng lúc chưa đăng nhập thì bấm vào nó mở hộp đăng nhập,
  không mint gì cả.
- **Sai ở đâu:** Lấy "build sạch, test xanh, HTTP 200" làm bằng chứng giao diện đúng.
  Bốn thứ đó chỉ chứng minh code **chạy**, không chứng minh nó **nhìn ra sao** hay
  **nói đúng sự thật**. Không một công cụ nào trong số đó bắt được cả hai lỗi trên, và cả
  hai đều là thứ người dùng thấy ngay giây đầu.
- **Luật rút ra:** Việc nào có giao diện thì **chụp ảnh trang thật rồi nhìn** trước khi
  báo cáo, không chỉ curl lấy chữ. Kèm hai câu hỏi hỏi mỗi nút và mỗi chỗ giữ chỗ:
  "chữ trên nút có đúng việc nó sẽ làm ở trạng thái hiện tại không" và "chỗ đang tải có
  trông như đang tải không, hay như một thứ bị hỏng".
- **Skill đích:** `minimalist-ui`, `design-taste-frontend`, `frontend-e2e-wallet`

### [2026-07-30] Bỏ sót điều kiện tiên quyết "có gas chưa"

- **Chuyện gì xảy ra:** Trang smoke test checkpoint 0 xử hai điều kiện trước khi cho
  bấm Mint: đã nối ví chưa, đúng mạng chưa. Nhưng **quên kiểm ví có ETH trả gas**. User
  nối ví riêng vào chain local mới dựng, ví đó 0 ETH, bấm Mint không được. User phải tự
  báo lỗi rồi Claude mới đi tìm nguyên nhân.
- **Sai ở đâu:** Vi phạm trực tiếp quy tắc 3.2 của `CLAUDE.md`. Chain local mới dựng chỉ
  có 20 địa chỉ test của nó là có tiền, mọi ví khác đều 0 ETH. Đây là ca chắc chắn xảy
  ra, không phải ca hiếm.
- **Luật rút ra:** Với mọi nút gửi giao dịch, danh sách điều kiện tiên quyết tối thiểu
  là: đã nối ví, đúng mạng, contract đã deploy, **đủ ETH trả gas**, đủ token, đã approve.
  Kiểm đủ cả sáu rồi mới hiện nút. Thiếu điều kiện nào thì hiện cách khắc phục, đừng
  hiện một nút chắc chắn fail.
- **Skill đích:** `vibe-code-dapp`, `design-taste-frontend`

### [2026-07-30] Nuốt lỗi giao dịch, nút tự reset không nói gì

- **Chuyện gì xảy ra:** Dùng `useWriteContract` của wagmi nhưng không đọc `error` mà hook
  đó trả về. Mint fail thì nút lặng lẽ trở về trạng thái ban đầu, màn hình không có một
  chữ nào giải thích. User bấm mà không biết vì sao không được.
- **Sai ở đâu:** Viết xong đường đi thuận rồi coi như hết việc. Trong dApp thì giao dịch
  fail là chuyện thường ngày: hết gas, user bấm Reject, contract revert, nonce lệch.
- **Luật rút ra:** Hook nào trả `error` thì phải render `error` ra màn hình, cùng lúc
  viết đường đi thuận chứ không để dọn sau. Dùng `shortMessage` của viem, nó ngắn và
  đọc được, `message` thì dài và đầy chữ kỹ thuật.
- **Skill đích:** `vibe-code-dapp`, `frontend-e2e-wallet` (thêm ca test bấm Reject)

### [2026-07-30] Thiết kế luồng dev bắt user dán private key vào ví

- **Chuyện gì xảy ra:** Hướng dẫn setup local mặc định là "nhập private key của account
  0 Hardhat vào MetaMask". User từ chối, nói rõ không muốn dán thêm private key vào ví.
  Phải viết lại thành `scripts/fund.js` bơm ETH và USDC cho ví có sẵn của user.
- **Sai ở đâu:** Bê nguyên thói quen phổ biến của dev Solidity mà không hỏi. Dán private
  key lạ vào ví đang dùng thật là việc nhiều người không muốn làm, và họ đúng.
- **Luật rút ra:** Luồng dev local mặc định là bơm tiền cho ví người dùng đã có, không
  phải bắt họ nhập khoá mới. Viết sẵn script fund đọc địa chỉ từ `.env`, kèm chặn không
  cho chạy ngoài chain local vì nó mint tiền miễn phí.
- **Skill đích:** `vibe-code-dapp`

### [2026-07-30] Thêm một trạng thái giữ tiền mà không hỏi "làm sao ra khỏi đây"

- **Chuyện gì xảy ra:** Thêm trạng thái `Disputed` vào contract escrow. Viết xong, test
  xanh 80/80, Slither sạch, chạy thật trên chain đúng cả ba verdict. Rồi mới nhận ra:
  nếu không ai phán quyết thì trạng thái đứng ở `Disputed` vĩnh viễn, `finalize` từ chối
  vì sai trạng thái, và **cọc bị khoá trong contract không có đường nào lấy ra**, vì cố
  ý không có hàm admin nào. Suýt nữa báo cáo là xong.
  Cùng lúc đó còn một ca nữa cùng loại: `openDispute` lúc đầu cho mở lại từ `Disputed`,
  tức là hai bên có thể liên tục đẩy hạn phán quyết ra xa mãi.
- **Sai ở đâu:** Đã làm đúng phân tích này cho `Active` và `Returned` ở lượt trước (nên
  mới có timeout 3 ngày), rồi thêm trạng thái mới mà **không lặp lại phân tích đó**. Test
  và Slither không bắt được loại lỗi này: không có gì revert sai, không có gì tính sai,
  chỉ là thiếu một đường đi. Muốn thấy nó phải ngồi liệt kê ra, công cụ không giúp.
- **Luật rút ra:** Mỗi lần thêm một trạng thái vào máy trạng thái đang giữ tiền, trả lời
  ba câu trước khi viết dòng đầu tiên: (1) từ trạng thái này có đường ra nào **không phụ
  thuộc vào một bên cụ thể phải hành động**; (2) nếu mọi bên đều nằm im thì tiền đi đâu;
  (3) có ai tự đẩy được thời hạn ra xa mãi không. Viết luôn một test cho mỗi câu.
  Nguyên tắc gốc: tiền vào được thì phải có đường ra được, và đường ra đó không được
  cần tới thiện chí của ai.
- **Skill đích:** `vibe-code-dapp`, `contract-test-audit`, `agentic-engineering`

### [2026-07-30] Nhân đôi logic tính mốc thời gian ở hai hàm động tới tiền

- **Chuyện gì xảy ra:** `finalize` và `openDispute` đều cần cùng một mốc "hạn nhả cọc",
  tính khác nhau tuỳ trạng thái Returned hay Active. Viết rời ra thành hai khối `if`
  giống nhau ở hai hàm. Không ai phát hiện lúc review, chỉ tới khi Slither báo
  `uninitialized-local` mới nhìn lại và thấy đoạn đó bị nhân đôi.
- **Sai ở đâu:** Hai bản sao của một luật về **tiền và thời gian**. Sau này sửa cửa sổ
  3 ngày ở một hàm mà quên hàm kia thì có ca tiền vừa được nhả vừa còn mở tranh chấp
  được, mà test đang có sẽ không bắt vì mỗi test chỉ đi qua một hàm.
- **Luật rút ra:** Một luật về tiền hoặc thời gian chỉ được viết ở **đúng một chỗ**, rút
  thành hàm riêng ngay lần thứ hai cần tới nó, không đợi lần thứ ba. Đây là ngoại lệ
  của quy tắc "thà viết thẳng ba lần": viết thẳng được với code hiển thị, không được với
  luật chia tiền. Khi rút ra, để hàm chung trả về giá trị và để bên gọi tự chọn lỗi, như
  vậy mỗi hàm vẫn báo lỗi đúng ngữ cảnh của nó.
- **Skill đích:** `vibe-code-dapp`, `contract-test-audit`

### [2026-07-30] Test mang tên một giới hạn nhưng không thử đúng cái giới hạn đó chặn

- **Chuyện gì xảy ra:** Thêm `MAX_RENTAL_DAYS = 30` để vòng lặp đánh dấu ngày không
  hết gas. Viết `test_AcceptsExactlyMaxDays` nhưng test đó chỉ gọi `requestRental` rồi
  assert trạng thái. Mà `requestRental` không chạy vòng lặp nào, `approveRental` mới
  chạy. Tức là test mang tên giới hạn gas nhưng chưa hề chạm tới đoạn tốn gas.
- **Sai ở đâu:** Test đúng cái tên hàm gần nhất thay vì đúng **rủi ro** mà giới hạn đó
  sinh ra để chặn. Nếu trần bị nâng lên 500 ngày, test cũ vẫn xanh trong khi
  `approveRental` đã hết gas.
- **Luật rút ra:** Đặt một giới hạn nào thì test phải chạy đúng thao tác mà giới hạn đó
  bảo vệ, ở đúng giá trị biên, và **đo thật** con số đáng lo. Ở đây là đo gas của
  `approveRental` với 30 ngày rồi assert nó dưới ngưỡng, chứ không chỉ assert trạng thái.
  Hỏi trước khi viết test: "nếu bỏ giới hạn này đi, test của mình có đỏ không?"
- **Skill đích:** `contract-test-audit`

### [2026-07-30] Quên đặt target ES2020 khi dựng Next cho dApp

- **Chuyện gì xảy ra:** `create-next-app` để `target: "ES2017"` trong `tsconfig.json`.
  Tới lúc viết `gas.value > 0n` thì typecheck chết: literal BigInt cần ES2020 trở lên.
- **Sai ở đâu:** Không phải lỗi nặng, nhưng nó chắc chắn xảy ra ở mọi dự án Next dùng
  viem hay wagmi, vì hai thư viện đó làm việc bằng BigInt. Sửa lúc dựng repo tốn một
  dòng, sửa lúc đang code thì cắt ngang mạch việc.
- **Luật rút ra:** Dựng Next cho dApp thì đặt `target: "ES2020"` ngay ở bước tạo project.
  Kèm theo: nếu sửa `tsconfig.json` mà typecheck vẫn báo lỗi cũ thì xoá
  `tsconfig.tsbuildinfo`, cache incremental giữ kết quả cũ và làm tưởng sửa không hiệu lực.
- **Skill đích:** `vibe-code-dapp`

### [2026-08-01] Đổi nơi giữ sự thật ở tầng code mà không quét lại tầng schema

- **Chuyện gì xảy ra:** Checkpoint 0 dựng bảng `rentals` trong Supabase làm bản sao của
  contract, `reviews` và `messages` khoá ngoại vào nó. Checkpoint 6 chốt đơn thuê chỉ đọc
  thẳng từ chain, không sao chép nữa. Không ai viết vào `rentals` nữa, nên khoá ngoại trỏ
  vào hàng vĩnh viễn không tồn tại. Tới checkpoint 7 viết API review mới lộ ra.
- **Sai ở đâu:** Coi quyết định "đọc từ chain" là quyết định của một file, trong khi nó
  là quyết định về **nguồn sự thật**. Mọi thứ từng trỏ vào nguồn cũ đều hỏng theo, kể cả
  thứ nằm ngoài repo như schema database.
- **Luật rút ra:** Khi đổi chỗ giữ sự thật của một thực thể, liệt kê ngay mọi nơi đang
  tham chiếu tới nó - bảng, khoá ngoại, cache, seed - rồi sửa hết trong cùng lượt. Đặc
  biệt schema, vì nó không được typecheck và không nằm trong build nên hỏng lặng lẽ.
- **Skill đích:** `vibe-code-dapp`

### [2026-08-01] Viết một assert luôn đúng rồi tính nó là một test đã qua

- **Chuyện gì xảy ra:** Trong script e2e có dòng `check("không còn tiền kẹt trong
  escrow", true)`. Nó in PASS ở mọi lần chạy vì điều kiện là hằng số `true`, không đo gì
  cả. Đếm vào tổng "19/19 xanh" như một test thật.
- **Sai ở đâu:** Lúc viết thì chưa biết lấy số dư nền ở đâu nên để tạm `true` định quay
  lại, rồi nhìn hàng PASS mà tưởng đã xong. Một test không thể đỏ thì tệ hơn không có
  test, vì nó tạo cảm giác đã kiểm.
- **Luật rút ra:** Mỗi assert phải trả lời được "giá trị nào làm dòng này đỏ". Không trả
  lời được thì xoá. Không bao giờ để hằng số trong vị trí điều kiện, kể cả tạm.
- **Skill đích:** `contract-test-audit`

### [2026-08-01] Test bằng khoá riêng nên không chạm tới hành vi của ví thật

- **Chuyện gì xảy ra:** Script e2e ký bằng private key qua viem, chạy trọn vòng 22/22
  xanh. User bấm thử bằng MetaMask thì `checkOut` chết ngay ở tầng node vì gas limit.
  Viem ước lượng gas rồi dùng đúng con số đó, còn ví thật khi không tin ước lượng thì lấy
  trần theo phần trăm block gas limit, ra con số lớn gấp trăm lần và vượt giới hạn của node.
- **Sai ở đâu:** Coi "ký được bằng viem" là bằng chứng "ký được bằng ví". Hai bên khác
  nhau ở chỗ đắt nhất: cách chọn gas, cách xử lý ước lượng thất bại, cách nhớ nonce.
- **Luật rút ra:** E2E ký bằng khoá riêng chỉ chứng minh contract đúng, không chứng minh
  luồng ví đúng. Còn phải chạy một vòng bằng ví thật, hoặc dựng cấu hình chain local sao
  cho mọi trần mà ví có thể chọn đều nằm trong ngưỡng node chấp nhận.
- **Skill đích:** `frontend-e2e-wallet`

### [2026-08-01] Chạy script bằng tsx rồi tưởng như vậy là đã kiểm kiểu

- **Chuyện gì xảy ra:** Chạy `tsc --noEmit` sạch, sau đó viết thêm một hàm, chỉ chạy lại
  bằng `tsx` thấy in ra PASS nên đi tiếp. Lỗi kiểu trong hàm mới nằm im tới lúc
  `next build` mới nổ.
- **Sai ở đâu:** `tsx` bóc kiểu đi rồi chạy, nó không kiểm kiểu bao giờ. Script chạy
  thành công là bằng chứng về runtime, không phải bằng chứng về kiểu.
- **Luật rút ra:** Viết thêm code sau lần typecheck cuối thì phải typecheck lại trước khi
  báo xong. Việc chạy được không thay thế được việc biên dịch được.
- **Skill đích:** `vibe-code-dapp`

### [2026-08-01] Hai chỗ cùng trả lời "tôi là ai", và chúng lệch nhau

- **Chuyện gì xảy ra:** Nút bấm gửi giao dịch lấy địa chỉ từ ví đang chọn trong MetaMask.
  Mọi thứ gọi API lại nhận diện bằng token đăng nhập, vốn chốt từ lúc login. User đổi ví
  trong extension thì chỉ vế đầu đổi. Header hiện ví mới, còn chat, chuông và badge vẫn là
  của ví cũ: tin nhắn gửi cho ví đang hiện thì không thấy, mở luồng ra lại đánh dấu đã đọc
  cho người khác. Nặng hơn phần nhìn thấy: chữ ký đi từ ví này còn server ghi sổ cho ví kia.
- **Sai ở đâu:** Coi "địa chỉ ví" là một dữ kiện duy nhất, trong khi hệ thống có **hai
  nguồn** trả lời cùng một câu hỏi và không có gì buộc chúng khớp nhau. Không hề kiểm
  chúng có bằng nhau không, nên lúc lệch thì lệch âm thầm và giao diện vẫn trông bình thường.
- **Luật rút ra:** Dựng app có đăng nhập kèm ví thì liệt kê ra **mọi nguồn danh tính** rồi
  so chúng ở một chỗ. Lệch nhau thì dừng và bắt đăng nhập lại, không đoán bên nào đúng.
  Kèm theo: đổi ví trong extension không remount gì cả, phải bắt sự kiện `accountsChanged`
  rồi tải lại trang, vì state React còn lại từ ví trước chính là thứ hiện nhầm địa chỉ.
  Dấu hiệu nhận ra sớm: cùng một thực thể mà chỗ này đọc từ ví, chỗ kia đọc từ phiên.
- **Skill đích:** `frontend-e2e-wallet`

### [2026-08-01] Đếm ngược bằng đồng hồ máy trong khi contract xét đồng hồ chain

- **Chuyện gì xảy ra:** Đồng hồ đếm tới lúc nhả cọc tính bằng `Date.now()`, còn contract
  so với `block.timestamp`. Bấm nút dev tua chain 3 ngày thì chain nhảy, màn hình đứng
  yên, nút nhả cọc vẫn mờ. Nhìn như nút tua hỏng, thật ra là đồng hồ trên màn hình đo
  nhầm cái đồng hồ.
- **Sai ở đâu:** Lấy nguồn thời gian tiện tay nhất thay vì nguồn mà **bên ra quyết định**
  đang dùng. Máy người dùng lệch giờ cũng ra cùng một lỗi, chỉ là không ai để ý.
- **Luật rút ra:** Hiển thị một hạn chót do contract xét thì phải lấy mốc từ block mới
  nhất rồi tính chênh lệch, đồng hồ máy chỉ dùng để lấp các giây giữa hai block. Tổng
  quát hơn: số nào contract quyết thì đọc từ contract, đừng tính lại ở frontend.
- **Skill đích:** `vibe-code-dapp`

### [2026-08-02] Khoá dữ liệu off-chain theo một id mà chain local dùng lại từ đầu

- **Chuyện gì xảy ra:** Review khoá theo số thứ tự đơn thuê trên chain. Dựng lại node
  local là số quay về 1, nên **đơn #1 mới thừa hưởng review của đơn #1 cũ đã biến mất**.
  User thấy đánh giá của người lạ trên đơn mình chưa làm gì, và ô viết review loé lên chưa
  tới một giây rồi bị thay bằng review cũ.
- **Sai ở đâu:** Chốt đúng rằng đơn thuê sống trên chain và off-chain trỏ vào bằng id, mà
  không hỏi **id đó có bị dùng lại không**. Trên testnet thì không, nhưng chain local dựng
  lại liên tục, nên bug chỉ hiện lúc dev và dễ bị coi là chuyện vặt của môi trường.
- **Luật rút ra:** Dữ liệu ngoài chain trỏ vào dữ liệu trên chain thì id đó phải **duy
  nhất qua các lần dựng lại chain**, hoặc quy trình reset chain phải dọn luôn dữ liệu bám
  theo. Chọn cách hai thì gắn nó vào chính lệnh reset, đừng để người ta nhớ.
- **Skill đích:** `vibe-code-dapp`

### [2026-08-02] Báo đã sửa bố cục sau khi chỉ xem trạng thái mà nó tình cờ chạy đúng

- **Chuyện gì xảy ra:** Tách chat và ô review thành hai cột, kiểm ở trạng thái Hoàn tất
  thấy đúng, báo xong. Nhưng điều kiện bật hai cột là **cả hai cùng hiện**, mà review chỉ
  có ở Hoàn tất. Ở trạng thái Returned, đúng cái user đang nhìn, không có gì thay đổi và
  user phải hỏi lại "bạn có sửa chưa đó".
- **Sai ở đâu:** Kiểm ở trạng thái thuận tay nhất rồi suy ra các trạng thái khác cũng vậy.
  Với giao diện có điều kiện thì chính cái điều kiện đó là chỗ dễ sai nhất.
- **Luật rút ra:** Sửa giao diện phụ thuộc trạng thái thì **liệt kê mọi trạng thái nó đi
  qua** rồi xem từng cái, ưu tiên xem trạng thái user đang đứng chứ không phải trạng thái
  dễ dựng lại nhất.
- **Skill đích:** `minimalist-ui`, `frontend-e2e-wallet`

### [2026-08-02] Số đo về token cho agent, để lần sau khỏi dò lại

- **Chuyện gì xảy ra:** Cả một buổi dò cách nhét lọt một lần gọi kiểm duyệt hai ảnh vào
  gói miễn phí Groq, 8000 token mỗi phút. Ghi lại kết quả đo được vì suy luận từ trực giác
  sai gần hết.
- **Đo được gì:**
  - **Kích thước ảnh không ảnh hưởng token.** Cùng một tấm ở 1187x762, 512x329 và 224x144
    đều tốn đúng 3599 token cho 2 tấm. Nén ảnh để tiết kiệm token là vô ích. Vẫn nên nén,
    nhưng vì tốc độ tải trang.
  - **`max_completion_tokens` bị tính vào hạn mức dù không dùng hết.** Đặt 4096 làm request
    đòi 9048 trên trần 8000 và bị từ chối thẳng, thử lại bao nhiêu lần cũng vô ích.
  - **Khe an toàn rất hẹp và phải dò nhị phân trên dữ liệu thật:** 3000 đòi 8143 (từ chối),
    2560 model nghĩ hết chỗ trả rỗng, 2816 vừa đủ và dùng hết 2018.
  - **Tắt suy nghĩ rẻ gấp 10 nhanh gấp 7 nhưng phán sai.** `reasoning_effort: none` từ chối
    một tin xe máy hoàn toàn sạch.
  - **`reasoning_format: hidden` không tiết kiệm token nào**, 1252 cả hai lần. Nó chỉ dọn
    output.
  - **Ảnh trắng rẻ hơn ảnh thật rõ rệt**, vì ảnh thật cho model nhiều thứ để suy nghĩ hơn.
    Bộ test dùng ảnh trắng đo ra con số không dùng được cho sản phẩm.
- **Luật rút ra:** Với API tính tiền theo token, **đo bằng thí nghiệm có đối chứng trên
  đúng dữ liệu thật**, đổi một biến mỗi lần, đọc `usage` nhà cung cấp trả về. Và luôn chặn
  trần thời gian chờ khi thử lại: tin thẳng `retry-after` khiến một lệnh đăng tin treo mười
  lăm phút với vòng xoay và không lời giải thích.
- **Skill đích:** `agentic-engineering`, `latch-agent-gateway`

### [2026-08-02] Bọc try/catch im lặng quanh một lời gọi, rồi lỗi thật nằm im trong đó

- **Chuyện gì xảy ra:** Viết hàm đọc chain để ẩn món đang cho thuê, bọc `try/catch` với
  chú thích "chain chết thì thà hiện thừa còn hơn vỡ trang". Chạy thử thì kết quả rỗng.
  Nguyên nhân thật: **chain local không có contract Multicall3**, nên `multicall` ném lỗi
  ngay lần gọi đầu. Cái catch nuốt sạch, và triệu chứng là "không có món nào đang thuê",
  tức là **giống hệt lúc chạy đúng mà chưa ai thuê gì**.
- **Sai ở đâu:** Chọn giá trị fallback trùng với một trạng thái hợp lệ. Khi lỗi và khi
  bình thường ra cùng một kết quả thì không có cách nào phân biệt từ bên ngoài. Chú thích
  còn khiến nó trông như một quyết định chín chắn.
- **Luật rút ra:** `catch` nuốt lỗi thì **bắt buộc phải log**, kể cả khi đã có phương án
  dự phòng. Và khi giá trị dự phòng trùng với một trạng thái bình thường thì phải kiểm
  bằng một ca có dữ liệu thật, không được kiểm bằng ca rỗng. Kèm theo: `multicall` cần
  Multicall3 tồn tại trên chain, node Hardhat mới dựng thì không có, nên dùng nhiều lời
  gọi song song để một đường code chạy được cả local lẫn testnet.
- **Skill đích:** `vibe-code-dapp`

### [2026-08-02] Sửa một giới hạn bằng cách nâng nó lên, và tạo ra lỗi không bao giờ hết

- **Chuyện gì xảy ra:** Model nghĩ hết ngân sách token đầu ra rồi trả rỗng, nhà cung cấp
  từ chối request kèm lỗi nói về JSON. Sửa bằng cách nâng `max_completion_tokens` lên
  4096. Nhưng nhà cung cấp **tính cả phần dự trữ đó vào hạn mức mỗi phút**, dùng hay không
  cũng tính. Kết quả: tin có 2 ảnh đòi 9048 token trong khi trần cả phút là 8000, tức là
  **không phút nào vừa**. Thử lại vô nghĩa, mà triệu chứng thì giống hệt "tạm hết token".
- **Sai ở đâu:** Chỉnh một con số để thoát lỗi trước mắt mà không hỏi con số đó còn nằm
  trong ràng buộc nào khác. Hai giới hạn kéo ngược chiều nhau: đặt thấp thì model nghĩ
  chưa xong đã hết chỗ, đặt cao thì cả request vượt trần phút.
- **Luật rút ra:** Trước khi nâng một hạn mức, liệt kê **mọi ràng buộc con số đó tham
  gia**, không chỉ cái đang báo lỗi. Và phân biệt hai loại cạn tài nguyên: loại tự hết
  sau một lúc thì chờ rồi thử lại, loại vượt trần tuyệt đối thì thử lại là vô ích và phải
  báo đúng nguyên nhân. Hiện ra như nhau nhưng cách xử ngược nhau.
- **Skill đích:** `agentic-engineering`

### [2026-08-02] Đo chi phí trên một hình dạng request mà sản phẩm không bao giờ gửi

- **Chuyện gì xảy ra:** Bộ test kiểm duyệt chạy tin **không ảnh**, đo ra 1250 token mỗi
  lần, rồi báo cáo với user là "khoảng 6 tin mỗi phút". Sản phẩm thật luôn gửi kèm 2 ảnh,
  tốn ~7000, tức **1 tin mỗi phút**. Sai số 6 lần, và con số sai đó đã dùng để trấn an
  user rằng giới hạn không đáng lo.
- **Sai ở đâu:** Bỏ ảnh khỏi test cho nhanh, rồi quên rằng mình đang đo một thứ khác với
  thứ chạy thật. Tệ hơn: đem con số đó đi kết luận về vận hành.
- **Luật rút ra:** Số đo dùng để ra quyết định thì phải lấy từ **đúng hình dạng request
  sản phẩm gửi**. Muốn test nhanh thì tách làm hai: phần logic chạy nhẹ, cộng ít nhất một
  ca chạy đúng hình dạng thật để giữ cho con số trung thực.
- **Skill đích:** `agentic-engineering`

### [2026-08-02] Định tối ưu theo trực giác, may là đo trước

- **Chuyện gì xảy ra:** Cần giảm token, hướng đầu tiên nghĩ tới là nén ảnh nhỏ lại. Đo
  thử: cùng một tấm ảnh ở 1187x762, 512x329 và 224x144 đều tốn **đúng 3599 token**. Nhà
  cung cấp tính phẳng theo số ảnh, không theo độ phân giải. Nếu làm luôn thì đã tốn một
  buổi viết code nén ảnh mà tiết kiệm được 0 token.
- **Sai ở đâu:** Không sai, ghi lại để làm mốc. Trực giác "ảnh to thì tốn nhiều" là hợp
  lý và hoàn toàn sai với dịch vụ này.
- **Luật rút ra:** Cách tính chi phí của dịch vụ ngoài phải **đo bằng một thí nghiệm có
  đối chứng** trước khi tối ưu theo nó: đổi đúng một biến, giữ nguyên phần còn lại, so
  con số nhà cung cấp trả về. Suy luận từ cách mình nghĩ hệ thống hoạt động không thay
  thế được.
- **Skill đích:** `agentic-engineering`

### [2026-08-04] Thử lại một lỗi không bao giờ tự hết, và mỗi lần thử lại tốn thêm quota

- **Chuyện gì xảy ra:** Hàm gọi model gặp 429 thì chờ rồi thử lại 3 lần. Provider cũ chặn
  theo phút nên chờ là đúng. Provider mới chặn theo **ngày**, mà mỗi lần thử lại vẫn tính
  là một request. Một lời gọi hỏng đốt 4 trong tổng số 20 lượt cả ngày, và không lần nào
  có cơ hội thành công. Hai lời gọi hỏng là mất 40% hạn mức, trước khi kịp nhận ra.
- **Sai ở đâu:** File cũ `groq.ts` **đã có** phân biệt "hết token phút, chờ là xong" với
  "request quá lớn, chờ vô ích". Lúc viết `model.ts` mình chép phần chờ mà làm rơi phần
  phân biệt. Viết lại một file thì phần dễ mất nhất là phần đã học được từ đau thương, vì
  nó trông như một nhánh `if` thừa.
- **Luật rút ra:** Trước khi thử lại bất kỳ lỗi hạn mức nào, hỏi hai câu: **chờ thì nó có
  tự hết không**, và **lần thử lại có tốn thêm hạn mức không**. Trả lời "không" và "có" thì
  phải hỏng ngay kèm câu giải thích, đừng thử lại. Với Gemini, nhận diện bằng `quotaId` có
  chữ `PerDay`.
- **Khi viết lại một module:** đọc bản cũ tìm những nhánh trông có vẻ thừa và hỏi vì sao
  chúng ở đó, trước khi bỏ. Comment trong bản cũ chính là câu trả lời.
- **Skill đích:** `agentic-engineering`

### [2026-08-03] Chọn model theo độ thông minh, quên hỏi trần dùng mỗi ngày

- **Chuyện gì xảy ra:** Đổi từ Groq sang Gemini, chọn `gemini-3.6-flash` vì nó mới nhất và
  không phải preview. Đo token thấy rất thoáng: 250.000 token mỗi phút, một vụ tranh chấp
  kèm 2 ảnh chỉ tốn 2.450. Chạy hai bộ test thì đứt. Đọc kỹ lỗi 429 mới thấy trần bị đụng
  không phải token mà là `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, **limit: 20**.
  Hai mươi request một **ngày**. Một lượt test đốt hết.
- **Sai ở đâu:** Chỉ nhìn hạn mức theo phút vì đó là thứ provider cũ chặn mình. Nhà cung
  cấp mới chặn bằng chiều khác hẳn, mà chiều đó không xuất hiện trong bất kỳ phép đo nào
  đã chạy. Đo đúng thứ mình đã biết, không đo thứ mình chưa biết.
- **Luật rút ra:** Trước khi chốt model trên free tier, mở **trang rate limit của chính
  tài khoản** và đọc đủ ba con số RPM, TPM, RPD. Con số quyết định thường không phải con số
  provider trước đã dạy mình để ý. Đọc nguyên văn `quotaId` trong lỗi 429, nó gọi thẳng tên
  chiều bị đụng.
- **Thứ nhặt được:** quota tính **theo từng model**, nên chia hai việc cho hai model là
  nhân đôi hạn mức miễn phí. Ở đây mọi model đều 20/ngày trừ `gemini-3.5-flash-lite` được
  500. Kiểm duyệt listing chạy nhiều nên đẩy sang flash-lite, xử tranh chấp chạy ít nên
  giữ model khôn. Chia theo **tần suất**, không theo độ khó.
- **Skill đích:** `agentic-engineering`

### [2026-08-03] Nội dung mặc định vô hình, chờ JavaScript bật lên mới thấy

- **Chuyện gì xảy ra:** Hiệu ứng hiện dần ở trang landing viết bằng IntersectionObserver:
  HTML server gửi ra để `opacity-0`, React chạy rồi mới bật lên 1. Chụp màn hình lại thì
  ra **trang trắng gần hoàn toàn**. Giám khảo mạng yếu, hoặc JS lỗi, sẽ thấy đúng như vậy.
- **Sai ở đâu:** Lấy hiệu ứng làm mặc định thay vì lấy nội dung làm mặc định. Trạng thái
  nghỉ của phần tử phải là "nhìn thấy được", còn hiệu ứng chỉ là đường đi tới đó.
- **Luật rút ra:** Không bao giờ để nội dung ở trạng thái ẩn rồi trông chờ JavaScript hiện
  nó ra. Fade thì dùng CSS `animation` với `backwards` fill: trình duyệt không chạy
  animation thì vẫn thấy chữ. Đổi lại còn bỏ được cả một component `"use client"`.
- **Cách phát hiện:** chụp màn hình. `tsc`, `eslint`, `npm run build` đều xanh với bug này,
  vì không có gì sai kiểu và không có gì sai cú pháp. Cùng họ với entry "báo đã sửa bố cục
  sau khi chỉ xem trạng thái tình cờ chạy đúng".
- **Skill đích:** `landing-page-builder`

### [2026-08-03] Đổi hình dạng request gửi model, quên hai thứ đã chỉnh theo hình dạng cũ

- **Chuyện gì xảy ra:** Bỏ ảnh khỏi lệnh gọi trọng tài. Hai thứ ăn theo ảnh vẫn nằm
  nguyên. Một: system prompt vẫn ghi "bạn sẽ thấy một ảnh từ mỗi bên" và "ảnh cho thấy đồ
  nguyên vẹn thì thắng lời khai", tức bảo model rằng nó có thứ nó không có, và nó sẽ bịa
  ra. Hai: trần `max_completion_tokens` 2816 là con số tính cho lúc còn phải trả tiền cho
  2 ảnh; bỏ ảnh rồi thì nó thành quá chặt, vụ tranh chấp thật đứt giữa chừng ngay lần chạy
  đầu tiên.
- **Sai ở đâu:** Coi "bỏ ảnh" là một sửa đổi ở một chỗ. Thật ra nó là đổi **hình dạng
  request**, mà quanh hình dạng đó có mấy thứ đã được chỉnh theo. Không compiler nào bắt
  được: prompt chỉ là chuỗi chữ, hằng số token chỉ là một con số hợp lệ.
- **Luật rút ra:** Đổi thứ agent **nhận** thì phải quét lại (a) system prompt, từng câu mô
  tả đầu vào, và (b) mọi hằng số đã đo theo hình dạng cũ. Prompt là code, chỉ khác ở chỗ
  không được kiểm kiểu, nên nó phải nằm trong danh sách file cần sửa chứ không phải chờ
  nhớ ra.
- **Skill đích:** `agentic-engineering`

### [2026-08-06] Tưởng đã khởi động lại, thật ra đang đo bản cũ

- **Chuyện gì xảy ra:** Dùng `pkill -f "next dev"` để tắt server trước mỗi lần chạy lại.
  Trên Windows lệnh đó **không giết được gì**, và nó im lặng, không báo lỗi, trả về như đã
  xong. Bản mới thấy cổng 3000 bận nên tự nhảy sang 3001, mình `curl` vào 3000 thấy 200 rồi
  kết luận "chạy tốt". Đo đúng cái bản cũ mình vừa tưởng đã tắt. Lần khác, log lẫn giữa hai
  tiến trình làm mình đọc sai một nhánh code.
- **Sai ở đâu:** Coi lệnh tắt là đã tắt. Không có phép kiểm nào giữa "ra lệnh dừng" và "đo
  kết quả", nên một lệnh vô hiệu biến mọi phép đo sau đó thành đo nhầm đối tượng, mà vẫn
  trông như bằng chứng.
- **Luật rút ra:** Trên Windows, tắt tiến trình phải giết **theo cổng**:
  `Get-NetTCPConnection -LocalPort <cổng> -State Listen` rồi `Stop-Process -Force`. Khởi
  động lại xong phải **đọc dòng `Local:` trong log** để chắc nó chiếm đúng cổng sắp đo.
- **Dấu hiệu nhận biết:** thấy app nhảy sang cổng khác (3001 thay vì 3000) là bản cũ còn
  sống. Đừng đo tiếp, đi giết nó trước.
- **Skill đích:** `code-change-workflow`

### [2026-08-06] Thử một endpoint biết ký, bằng id thật đang được dùng

- **Chuyện gì xảy ra:** Kiểm lớp chặn bí mật của route ký phán quyết. Ba ca: không header,
  sai header, đúng header. Hai ca đầu trả 401, đúng ý. Ca thứ ba dùng `rentalId: 1`, là đơn
  user đang test và đang ở trạng thái Disputed, nên nó **đi hết đường và ký thật**: đơn #1
  thành Completed, cọc về renter, lý do ghi đúng chữ `"x"` mình gõ bừa. Trên Sepolia, không
  hoàn tác được.
- **Sai ở đâu:** Viết ca kiểm để chứng minh "đường thuận chạy được", trên một endpoint mà
  đường thuận của nó là **chuyển tiền**. Hai ca từ chối thì vô hại, ca chấp nhận thì không,
  mà mình gom cả ba vào một vòng lặp như thể chúng cùng loại rủi ro.
- **Luật rút ra:** Thử endpoint có tác dụng phụ thì chọn dữ liệu **không thể thành công**:
  id không tồn tại, hoặc bản ghi ở sai trạng thái. Lớp chặn cần kiểm nằm **trước** các lớp
  sau, nên một phản hồi 404 hay 409 chứng minh nó đã lọt qua y hệt như 200, mà không để lại
  gì. Muốn thấy 200 thì dựng riêng một bản ghi dùng một lần, đừng mượn của người khác.
- **Skill đích:** `code-change-workflow`

### [2026-08-05] Deploy testnet quá muộn, và trả giá suốt quãng giữa

- **Chuyện gì xảy ra:** Trustfall làm gần trọn dự án trên Hardhat node, chỉ lên Sepolia ở
  checkpoint 12. Suốt quãng đó mỗi lần dựng lại chain là mất trạng thái: id đơn thuê chạy
  lại từ 1 trong khi Supabase vẫn giữ dòng khoá theo id cũ, nonce MetaMask lệch phải xoá
  activity data, địa chỉ contract đổi. Vòng lặp test đứt liên tục, tới mức user nói thẳng
  "local chain tệ quá". Lúc deploy thật thì lộ ra một loạt lỗi **chỉ có trên mạng công
  khai**, ở đúng thời điểm tệ nhất để phải sửa contract.
- **Sai ở đâu:** Lấy "xong sản phẩm" làm mốc deploy. Mốc đúng phải là "**xong hình dạng
  contract**". Hai thứ đó cách nhau rất xa, và toàn bộ khoảng cách đó là thời gian ngồi
  trên một nền móng cứ reset.
- **Luật rút ra:** Deploy lên testnet **ngay khi contract chốt và test xanh**, khoảng 40%
  tiến độ, đừng chờ frontend. Thứ ép phải deploy lại là **thay đổi contract**, còn thứ làm
  local khổ sở là **mọi thứ còn lại**. Chốt cái thứ nhất trước rồi làm cái thứ hai trên nền
  không bao giờ reset.
- **Chốt cái gì trước khi deploy:** quan trọng nhất là **vai trò và quyền**, tức ai được
  gọi hàm nào. Ở đây quyết định bỏ ví admin đến rất muộn, và đó đúng là loại thay đổi
  không sửa được nếu không deploy lại. Chữ ký hàm và event cũng vậy. Ngược lại, đổi text,
  đổi giao diện, đổi prompt của agent thì deploy lại làm gì.
- **Đừng làm gì:** đừng đầu tư công cụ cho local chain dễ chịu hơn. Ngày 2026-08-05 định
  thêm một route dựng sẵn cả vòng thuê để đỡ phải ký ví sáu lần, user dừng lại đúng lúc:
  "vẫn không giải quyết triệt để". Đúng, đó là vá triệu chứng của một quyết định sai về
  thời điểm.
- **Local chain còn dùng cho gì:** `forge test`, và lúc đang viết contract. Hết.
- **Deploy testnet xong thì xoá dữ liệu của chain Hardhat node đi.** Cụ thể là mục
  `"31337"` trong `deployed.json` và mọi dòng off-chain khoá theo `rental_id` của chain cũ.
  Địa chỉ trong đó trỏ tới contract trên một chain đã biến mất, mà nhìn thì y hệt địa chỉ
  thật. Giữ lại là để sẵn một thứ chỉ chờ đọc nhầm. Lưu ý phân biệt: **xoá dữ liệu, không
  xoá các lớp chặn có nhắc tới 31337** - những chỗ như `moderationBypassed()` dùng chain id
  để bảo đảm nút tắt kiểm duyệt không bao giờ chạy được ngoài local, gỡ nó đi là mở đường
  đăng tin không qua kiểm duyệt trên mạng thật.
- **Lúc nào thì nhắc user deploy:** **chỉ khi và đúng khi tới bước test flow của dApp.**
  Không nhắc sớm hơn, vì contract chưa chốt thì deploy là tự chuốc một lần deploy lại. Không
  nhắc muộn hơn, vì từ giây phút bắt đầu bấm thử cả luồng thì mỗi lần chain local reset là
  một lần mất trạng thái đang dở. Mốc đó nhận ra được: hết viết contract, hết viết test
  contract, bắt đầu ngồi bấm tay qua từng màn hình.
- **Skill đích:** `deploy-verify-contract`

### [2026-08-05] `git diff --stat` cho qua, vì file có đổi, chỉ là đổi thiếu

- **Chuyện gì xảy ra:** Sửa `dev-all.mjs` bằng `python .replace()`, hai khối lớn trượt âm
  thầm còn khối nhỏ thì trúng. `git diff --stat` thấy file có thay đổi nên qua ải, mình
  commit kèm message tả rõ hành vi mới. Chạy thật thì nó vẫn dựng chain mới như cũ. Đây là
  **lần thứ tư trong một phiên** cùng một kiểu trượt, và là **lần thứ hai** commit tả một
  hành vi chưa tồn tại.
- **Sai ở đâu:** Luật cũ mình tự đặt là "đối chiếu `git diff --stat` với danh sách file
  định sửa". Luật đó **không đủ**: nó bắt được file vắng mặt, không bắt được file có mặt
  mà thiếu hunk. Và `.replace()` của Python trả về chuỗi gốc khi không khớp, không ném lỗi,
  nên nhiều lệnh sửa gộp trong một script thì chỉ một cái trúng cũng trông như thành công.
- **Luật rút ra:** Sửa nhiều dòng trong file có sẵn thì **dùng Edit tool**, nó báo lỗi khi
  không khớp. Nếu buộc phải dùng script, sau đó phải `grep` một **chuỗi đặc trưng của hành
  vi mới** trong file, mỗi thay đổi một lần grep. Đếm số file là kiểm sai đơn vị, phải đếm
  số thay đổi.
- **Cách phát hiện lần này:** chạy thật rồi đọc output. Log in "1/3 hardhat node" thay vì
  "reusing it". Không có `tsc`, `eslint` hay build nào bắt được, vì code cũ vẫn hợp lệ.
- **Skill đích:** `code-change-workflow`

### [2026-08-03] Commit kèm message mô tả hành vi mà cây code chưa có

- **Chuyện gì xảy ra:** Commit với message nói trọng tài đã ngừng đọc ảnh, nhưng
  `lib/arbitrate.ts` không có mặt trong danh sách file thay đổi của commit đó. Phần sửa
  quan trọng nhất chưa vào cây code. Vẫn báo cáo là xong, vì `tsc` và `eslint` xanh, mà
  hai thứ đó xanh dù có sửa hay không.
- **Sai ở đâu:** Lấy "build xanh" làm bằng chứng cho "đã sửa". Chúng trả lời hai câu hỏi
  khác nhau: build xanh nói code hợp lệ, không nói code làm đúng thứ mình vừa hứa.
- **Luật rút ra:** Trước khi commit, đọc `git diff --stat` và **đối chiếu với danh sách
  file mình định sửa**. File đáng lẽ phải có mặt mà vắng là việc chưa làm, không phải việc
  không cần làm. Cùng họ với entry "báo đã sửa bố cục sau khi chỉ xem trạng thái tình cờ
  chạy đúng".
- **Skill đích:** `code-change-workflow`

### [2026-08-05] Gỡ một vai khỏi contract, và bảy câu chữ trong app vẫn kể về nó

- **Chuyện gì xảy ra:** User nhìn màn hình thấy dòng "Left for a human" rồi hỏi lại: admin
  làm gì có quyền. Kiểm contract thì hoá ra **có**, `resolveDispute` nhận cả `agent` lẫn
  `admin`, quyết định từ checkpoint 2. Nhưng trang `/admin` chỉ đọc, không có nút nào cho
  người đó bấm. Tức câu chữ hứa một hành động không có bề mặt nào để thực hiện. Chốt gỡ
  hẳn ví admin. Lúc gỡ mới đếm ra **bảy chỗ** đang kể về "human resolver": policy của agent,
  hai trang admin, hai route, `dispute-box`, và trang `/dev`.
- **Sai ở đâu:** Coi vai trò là một dòng trong contract. Thật ra một vai trò là một **lời
  hứa**, và lời hứa đó được nhắc lại ở mọi chỗ giải thích cho người dùng. Xoá ở contract mà
  không quét chữ thì sản phẩm vẫn nói về một người không tồn tại.
- **Luật rút ra:** Bỏ hoặc thêm một vai trò trong contract thì `grep` tên vai đó **trên cả
  repo** trước khi coi là xong, gồm cả prompt gửi cho model. Prompt là chỗ dễ sót nhất vì
  nó không phải giao diện, nhưng nó là thứ định hình cả phán quyết: policy đang bảo agent
  "dưới 0.6 thì chuyển cho người", trong khi không còn người nào.
- **Thứ nhặt được:** gỡ vai không làm mất an toàn, vì lớp bảo vệ thật không phải cái ví dự
  phòng mà là **hình dạng của quyền**: agent chỉ chọn được một trong ba chữ, và tranh chấp
  không ai xử thì sau 7 ngày ai cũng gọi `finalize` được và cọc về renter.
- **Skill đích:** `contract-test-audit`

### [2026-08-03] Cắt bớt thứ agent đọc mà suýt để giao diện nói dối là nó vẫn đọc

- **Chuyện gì xảy ra:** Trọng tài tranh chấp không chạy nổi trên free tier: hai lời khai
  cộng log chat cộng 2 ảnh là ~8100 token, trần 8000. Đo đủ cách (hạ budget, rút ngắn
  policy, ghép 2 ảnh làm 1 bằng jimp) đều không xuống dưới trần. Chốt: **bỏ ảnh khỏi lệnh
  gọi model**, agent chỉ đọc chữ. Ảnh vẫn nộp, vẫn lưu, vẫn hiện cho hai bên và cho
  `/admin`. Chỗ suýt sai là để nguyên màn hình cũ: ảnh nằm ngay cạnh phán quyết, người đọc
  đương nhiên hiểu là agent đã nhìn ảnh rồi mới phán.
- **Sai ở đâu:** Cắt năng lực vì giới hạn hạ tầng là quyết định đúng. Nhưng giao diện
  không tự cập nhật theo, và một màn hình để người ta suy ra sai còn tệ hơn màn hình thiếu
  thông tin, nhất là khi cái đang chia là tiền cọc của họ.
- **Luật rút ra:** Cắt bớt thứ agent được đọc thì **phải ghi lại đã đọc gì** cạnh phán
  quyết (ở đây là cột `evidence_seen`), và sửa mọi câu chữ trong UI đang ngụ ý điều
  ngược lại. Khi giới hạn ép phải chọn, cắt **năng lực**, đừng cắt **lớp chặn**: ngưỡng
  confidence, server ký, contract tự tính tiền giữ nguyên hết.
- **Skill đích:** `agentic-engineering`

### [2026-08-01] Viết ca test từ tưởng tượng, bản thật khó hơn đúng chỗ quyết định

- **Chuyện gì xảy ra:** Hàm đọc kết quả của model cắt từ dấu `{` đầu tới `}` cuối. Tự nghĩ
  ra ca test "model nói lảm nhảm trước rồi mới trả JSON", nhưng bản tưởng tượng chỉ có
  chữ. Bản thật có **JSON nháp và một bản copy của khuôn mẫu nằm ngay trong phần suy
  nghĩ**, nên lát cắt ôm trọn cả đoạn văn và parse chết. 15 test xanh, code hỏng.
- **Sai ở đâu:** Ca test viết ra để khớp với hình dung của mình về vấn đề, chứ không phải
  để khớp với vấn đề. Tệ hơn: lỗi này rơi vào nhánh an toàn nên tin bẩn vẫn bị chặn đúng,
  **chỉ tin sạch mới bị từ chối oan**. Nhìn từ ngoài giống bộ lọc nghiêm khắc chứ không
  giống parser hỏng, và nếu user không dán đúng output thật thì không ai phát hiện.
- **Luật rút ra:** Ca test cho dữ liệu từ hệ thống ngoài phải **copy nguyên văn output
  thật**, chạy một lần rồi dán vào, không được tự bịa. Và khi một lỗi rơi vào nhánh an
  toàn thì phải test cả nhánh ngược lại: chỗ nào "hỏng thì từ chối", chỗ đó bắt buộc có
  ca phải-được-duyệt, vì đó là ca duy nhất lộ ra lỗi.
- **Skill đích:** `agentic-engineering`

### [2026-08-01] Ghi tên model vào luật dự án bằng trí nhớ, tới lúc dùng thì model đã bị gỡ

- **Chuyện gì xảy ra:** CLAUDE.md mục 6 chốt sẵn từ đầu dự án là dùng Llama Guard cho chữ
  và Llama 4 Scout cho ảnh. Tới checkpoint 9 mới tra thì Groq đã bỏ cả hai khỏi danh mục.
  Model kiểm duyệt chuyên dụng còn lại thì đang preview, mà chính CLAUDE.md cấm preview.
  Ba dòng luật tự đá nhau, và phải dừng lại hỏi user để sửa luật.
- **Sai ở đâu:** Chốt một chi tiết vận hành của **dịch vụ ngoài** vào tài liệu thiết kế ở
  thời điểm chưa dùng tới nó, dựa trên hiểu biết có hạn sử dụng. Danh mục model đổi theo
  tháng, còn tài liệu thiết kế thì nằm im.
- **Luật rút ra:** Trong tài liệu thiết kế chỉ ghi **yêu cầu** ("cần model đọc được ảnh,
  không dùng bản preview"), đừng ghi tên cụ thể. Tên model chốt ở lúc code, sau khi gọi
  API liệt kê model của nhà cung cấp. Áp cho mọi thứ tương tự: model, gói giá, endpoint,
  giới hạn rate.
- **Skill đích:** `dapp-discovery`, `agentic-engineering`

### [2026-08-01] Dùng control gốc của trình duyệt trong app một ngôn ngữ

- **Chuyện gì xảy ra:** Ô chọn ảnh dùng `<input type="file">` trần. Trên trình duyệt để
  tiếng Việt, nó tự vẽ nút và chữ "Chọn tệp 2 tệp" giữa một trang toàn tiếng Anh.
- **Sai ở đâu:** Tưởng phần chữ đó do mình kiểm soát. Chữ trong `input file`, `input
  date`, và nút của `<video>` do trình duyệt sinh theo ngôn ngữ máy, không có thuộc tính
  HTML nào đổi được.
- **Luật rút ra:** App chốt một ngôn ngữ thì không để lộ control gốc có chữ. Ẩn input đi,
  bọc trong `<label>` và tự vẽ nút, vì bấm label vẫn mở được hộp thoại chọn file.
- **Skill đích:** `minimalist-ui`

Ba loại user đã nêu cho mục này:

- **Thiếu component:** dựng màn hình mà bỏ sót phần bắt buộc (skeleton lúc chờ, trạng
  thái rỗng, trạng thái lỗi, nút quay lại)
- **Bug UI/UX:** layout nhảy, chữ tràn, bấm hai lần ra hai giao dịch, không có phản hồi
  sau khi bấm
- **Bug flow có kết nối ví:** bỏ qua điều kiện tiên quyết (chưa nối ví, sai mạng, chưa
  approve, không đủ số dư), không xử ca user bấm huỷ trong ví, không xử giao dịch
  pending, không refetch sau khi giao dịch được mine

Loại thứ ba là loại đắt nhất vì nó chỉ lộ ra khi bấm thật, test tự động dễ bỏ sót.

### [2026-08-08] Để một cấu hình không đọc lại được thành thứ phải đoán khi lỗi
- **Chuyện gì xảy ra:** Secret của Latch được mã hoá lúc lưu, và **cả tên header lẫn giá
  trị đều không xem lại được**. User không nhớ chắc đã đặt tên header là
  `x-agent-gateway-secret` hay `agent-gateway-token`. Nếu sai thì mọi request trả 401, mà
  401 nhìn hệt như secret gõ sai, như Latch hỏng, như biến môi trường chưa lên Vercel.
- **Sai ở đâu:** Mình viết `cameThroughGateway` chỉ trả về `ok: false`. Đúng về bảo mật,
  vô dụng về chẩn đoán: nó vứt đi thứ duy nhất còn biết được, là **tên các header thật sự
  đã tới nơi**. Bên ngoài không đọc lại được thì bên trong phải ghi lại.
- **Luật rút ra:** Cấu hình nào chỉ ghi được một lần rồi không đọc lại được thì
  **phải có một đường tự khai ở phía mình**. Cụ thể: chỗ từ chối phải log ra cái nó đã
  nhận (tên, không bao giờ giá trị) chứ không chỉ log ra việc đã từ chối. Nguyên tắc
  chung: một lớp bảo vệ nên nói được vì sao nó từ chối, nếu không thì mỗi lần cấu hình
  sai lại thành một buổi mò.
- **Skill đích:** `latch-agent-gateway` (mục INJECT AS), `agentic-engineering`

---

## 4. Không ghi vào đây

- **Bug phiên bản thư viện.** Ví dụ "wagmi 3 không đi với RainbowKit 2.2.11", hay
  "Hardhat 2 mặc định evmVersion shanghai". Loại này có hạn sử dụng: thư viện ra bản mới
  là nó thành sai, mà chỉ thị sai còn tệ hơn không có chỉ thị. Chỗ đúng của nó là mục 9
  "Bẫy đã biết" trong `CLAUDE.md` của dự án, **kèm ngày**, để người đọc biết phải kiểm
  lại.
- **Đường dẫn bấm trong dashboard của dịch vụ ngoài.** Cùng lý do: nhà cung cấp đổi bố
  cục là chữ trong này thành sai đường. Ghi cái luật ("phải kiểm tính năng có cần bật
  không"), đừng ghi cái đường đi.
- **Lỗi cú pháp, lỗi gõ sai.** Sửa rồi đi tiếp, không lặp lại nên không cần ghi.
- **Lỗi chỉ xảy ra một lần** do môi trường lạ.

---

## 5. Đã gấp vào skill

Chưa có. Entry chuyển xuống đây khi luật của nó đã nằm trong skill và skill đã được sửa
thật. Giữ lại để biết đã xử gì rồi, không đọc nữa.

---

**Trần khoảng 30 entry ở mục 1 tới 3.** Quá thì gấp vào skill và chuyển xuống mục 5.
File phình là file không ai đọc.
