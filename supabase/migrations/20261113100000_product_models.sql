-- 상품 3D 모델 (아이폰 스캔 → public/products/<상품ID>.glb / .usdz)
-- model_url: 웹 3D 보기와 안드로이드 AR(GLB), model_usdz_url: 아이폰 AR Quick Look(USDZ, 없으면 GLB로 자동 변환)
alter table products add column if not exists model_url text;
alter table products add column if not exists model_usdz_url text;
