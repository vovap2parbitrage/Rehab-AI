#!/usr/bin/env bash
# Demo helper for the video comparison service.
# Usage: compare_demo.sh TOKEN reference.mp4 patient.mp4 [body_part]
# Uploads both videos to S3 via presigned POST, starts the comparison and polls the result.
# body_part: left_arm | right_arm | left_leg | right_leg | torso (default: right_leg)
set -euo pipefail

TOKEN="${1:?usage: compare_demo.sh TOKEN reference.mp4 patient.mp4 [body_part]}"
REF="${2:?reference video}"
PAT="${3:?patient video}"
PART="${4:-right_leg}"
API="${API:-http://localhost:8001/api/v1/comparisons}"

for f in "$REF" "$PAT"; do
  [ -f "$f" ] || { echo "File not found: $f"; exit 1; }
done

# tiny JSON helper (no jq needed): j '<python expression on d>' <<<"$json"
j() { python3 -c "import sys, json; d = json.load(sys.stdin); print($1)"; }

upload() {
  local file="$1" ticket url key args=()
  ticket=$(curl -sf -X POST "$API/uploads" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -d '{"content_type":"video/mp4"}') \
    || { echo "Could not get upload ticket (bad or expired token?)" >&2; exit 1; }
  url=$(j 'd["url"]' <<<"$ticket")
  key=$(j 'd["key"]' <<<"$ticket")
  while IFS= read -r line; do
    args+=(-F "$line")
  done < <(j '"\n".join(f"{k}={v}" for k, v in d["fields"].items())' <<<"$ticket")
  curl -sf -o /dev/null -X POST "$url" "${args[@]}" -F "file=@$file;type=video/mp4" \
    || { echo "Upload to storage failed" >&2; exit 1; }
  echo "$key"
}

REF_KEY=$(upload "$REF")
PAT_KEY=$(upload "$PAT")
echo "uploaded: $REF_KEY / $PAT_KEY"

TASK=$(curl -sf -X POST "$API" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"reference_key\":\"$REF_KEY\",\"patient_key\":\"$PAT_KEY\",\"body_parts\":[\"$PART\"]}" \
  | j 'd["task_id"]')
echo "task: $TASK"

for _ in $(seq 1 60); do
  RES=$(curl -sf "$API/$TASK" -H "Authorization: Bearer $TOKEN")
  if [ "$(j 'd["status"]' <<<"$RES")" != "pending" ]; then
    j 'json.dumps(d, indent=2, ensure_ascii=False)' <<<"$RES"
    exit 0
  fi
  sleep 3
done
echo "Still pending after 3 minutes"
exit 1
