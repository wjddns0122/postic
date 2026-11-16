#!/usr/bin/env bash
# 아이폰 스캔(Scaniverse 등)을 웹용으로 줄여서 public/products/ 에 넣는다
# 사용: scripts/prep-models.sh <상품ID> <스캔.glb> [스캔.usdz]
#   예: scripts/prep-models.sh A7-32F1 ~/Downloads/blazer.glb ~/Downloads/blazer.usdz
# - GLB: 좌표 양자화 + 텍스처 최대 2048px (원래 형식 유지) → 보통 수십 MB가 몇 MB로
# - USDZ: 아이폰 AR Quick Look용, 그대로 복사 (없으면 GLB에서 자동 변환됨)
# 끝나면 출력되는 SQL을 Supabase에서 실행하고 배포한다
set -euo pipefail
cd "$(dirname "$0")/.."
id=$1
glb=$2
usdz=${3:-}
out=public/products

npx --yes @gltf-transform/cli@4.5.1 optimize "$glb" "$out/$id.glb" \
  --compress quantize --texture-compress auto --texture-size 2048
if [ -n "$usdz" ]; then cp "$usdz" "$out/$id.usdz"; fi
ls -lh "$out/$id".glb ${usdz:+"$out/$id.usdz"}

usdz_sql=""
if [ -n "$usdz" ]; then usdz_sql=", model_usdz_url = '/products/$id.usdz'"; fi
echo
echo "로컬 미리보기: http://localhost:5174/p/$id?model3d=/products/$id.glb"
echo "DB 반영 SQL:   update products set model_url = '/products/$id.glb'$usdz_sql where id = '$id';"
