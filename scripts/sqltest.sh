#!/usr/bin/env bash
# Supabase(연결된 프로젝트)에서 SQL 테스트를 트랜잭션 안에서 돌리고 항상 롤백한다. 실DB에 흔적을 남기지 않는다.
# 단, 시퀀스(픽업 번호 등)는 롤백되지 않아 번호가 몇 개 건너뛸 수 있다.
#
# 사용:
#   scripts/sqltest.sh supabase/tests/erp_01_staff.sql                      # 적용된 스키마에 대해 테스트
#   scripts/sqltest.sh supabase/tests/erp_01_staff.sql supabase/migrations/X.sql   # 마이그레이션까지 같이 넣고 돌려본 뒤 롤백 (dry run)
# 준비: supabase login && supabase link --project-ref <ref>
set -euo pipefail
cd "$(dirname "$0")/.."

test_file=$1
shift
tmp=$(mktemp -t sqltest.XXXXXX)
trap 'rm -f "$tmp"' EXIT
{
  echo 'begin;'
  for m in "$@"; do cat "$m"; echo; done
  cat supabase/tests/_helpers.sql; echo
  cat "$test_file"; echo
  echo 'rollback;'
} > "$tmp"

if out=$(supabase db query --linked -f "$tmp" 2>&1); then
  echo "PASS $test_file${*:+ (with $*)}"
else
  echo "$out" | grep -vE '^\s*$' | tail -15
  echo "FAIL $test_file"
  exit 1
fi
