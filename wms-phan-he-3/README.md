# WMS – Phân hệ 3: Sản phẩm và Định giá danh mục

Hệ thống Quản lý tài sản dành cho khách hàng cá nhân (WMS). Repo này chứa phần việc của **Phân hệ 3** (UC-09 đến UC-12): danh mục sản phẩm, cập nhật giá có duyệt hai lớp, định giá danh mục Mark-to-Market và cảnh báo lệch tỷ trọng.

## Gồm những gì

```
.
├── src/product-valuation/    Mã nghiệp vụ NestJS và unit test (Jest)
│   ├── product-valuation.types.ts
│   ├── pricing.service.ts            UC-10, BR-15 (Maker-Checker)
│   ├── valuation.service.ts          UC-11, BR-17 (AUM, MtM)
│   ├── drift-detection.service.ts    UC-12, BR-16 (lệch từ 5 điểm %)
│   └── *.spec.ts                     Unit test cho từng service
├── demo/index.html           Bản demo web giả lập cả 4 phân hệ
├── docs/thiet-ke.md          Sơ đồ lớp, kiến trúc 4 tầng (Mermaid), giả định
└── .github/workflows/ci.yml  Tự chạy build và test mỗi lần push
```

## Chạy test

Cần Node.js 18 trở lên.

```bash
npm install
npm test            # chạy toàn bộ unit test
npm run test:cov    # kèm báo cáo độ phủ
npm run build       # kiểm tra kiểu TypeScript
```

## Chạy demo web

Mở trực tiếp `demo/index.html` bằng trình duyệt, hoặc chạy:

```bash
npm run demo
```

Một vòng thử nhanh: khách Nguyễn Văn An, vào Phân hệ 3, bấm **Chạy Job 17:00**, bấm **Tạo đề xuất tái cân bằng**, sang Phân hệ 4 duyệt bằng OTP `123456`, rồi thử lại với trượt giá 6% để thấy lệnh thất bại. Dữ liệu chỉ nằm trong bộ nhớ trình duyệt.

## Đưa lên GitHub

```bash
git init
git add .
git commit -m "Khởi tạo Phân hệ 3: mã nghiệp vụ, test, demo, tài liệu"
git branch -M main
git remote add origin https://github.com/<tai-khoan>/<ten-repo>.git
git push -u origin main
```

## Ghi chú

- Các service dùng interface repository (`AssetRepository`, `PricingRepository`, `AuditLogRepository`), chưa gắn ORM. Khi tích hợp vào dự án NestJS chính, viết lớp cài đặt các interface này theo ORM của dự án (TypeORM hoặc Prisma) và đăng ký bằng token `ASSET_REPOSITORY`, `PRICING_REPOSITORY`, `AUDIT_LOG_REPOSITORY`.
- Các giả định chưa có trong đặc tả được liệt kê ở `docs/thiet-ke.md`, mục 4.
- Bản demo web chỉ để hình dung luồng; Phân hệ 1, 2 và 4 trong demo là mô phỏng rút gọn.
