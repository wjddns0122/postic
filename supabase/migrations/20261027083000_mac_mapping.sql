-- 실물 BP106 3개만 사용: MAC으로도 인식 (iBeacon 슬롯 없이 Eddystone만 쏴도 인식되게)
alter table products add column mac text unique;

delete from products where hanger = 'HG-02';
delete from tag_presence where major = 2;

update products set mac = '789F380FF5AF' where id = 'A7-32F1'; -- 1/101
update products set mac = '789F380FF5C2' where id = 'B2-19C7'; -- 1/102
update products set mac = '789F380FF5CC' where id = 'C4-77A0'; -- 1/103
