-- 실물 옷 3벌로 교체 (사진: public/products/<상품ID>.jpg 앞면, -back.jpg 뒷면, -cut.png 행거용 컷아웃)
-- 가격·사이즈 재고는 시연용 값 그대로. 소재는 확인된 것만
alter table products add column if not exists back_image_url text;

update products set
  name = '3버튼 테일러드 자켓', brand = 'COMME ÇA DU MODE MEN', color = '블랙', material = null,
  image_url = '/products/A7-32F1.jpg', back_image_url = '/products/A7-32F1-back.jpg'
where id = 'A7-32F1';

update products set
  name = '셀비지 코듀로이 초어 자켓', brand = 'Drake''s', color = '브라운',
  material = '재팬 셀비지 코듀로이 · Made in Italy',
  image_url = '/products/B2-19C7.jpg', back_image_url = '/products/B2-19C7-back.jpg'
where id = 'B2-19C7';

update products set
  name = '후디드 파카', brand = 'POLYTERU', color = '베이지', material = null,
  image_url = '/products/C4-77A0.jpg', back_image_url = '/products/C4-77A0-back.jpg'
where id = 'C4-77A0';
