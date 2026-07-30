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
- **Lỗi cú pháp, lỗi gõ sai.** Sửa rồi đi tiếp, không lặp lại nên không cần ghi.
- **Lỗi chỉ xảy ra một lần** do môi trường lạ.

---

## 5. Đã gấp vào skill

Chưa có. Entry chuyển xuống đây khi luật của nó đã nằm trong skill và skill đã được sửa
thật. Giữ lại để biết đã xử gì rồi, không đọc nữa.

---

**Trần khoảng 30 entry ở mục 1 tới 3.** Quá thì gấp vào skill và chuyển xuống mục 5.
File phình là file không ai đọc.
