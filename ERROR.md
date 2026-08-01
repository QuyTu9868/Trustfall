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
