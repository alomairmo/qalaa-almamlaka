#!/usr/bin/env bash
# يستعيد الصور الثنائية (public/*.png) غير المضمّنة في المستودع.
# Restore binary image assets (public/*.png) not included in the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
curl -fsSL --retry 3 \
  "https://lazyikoawttfcflpdixs.supabase.co/storage/v1/object/public/asset-transfer/public-pngs.tar.gz" \
  | tar -xz
echo "تمت استعادة $(ls public/*.png | wc -l) صورة إلى public/"
