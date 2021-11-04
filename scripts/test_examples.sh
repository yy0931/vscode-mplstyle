#!/bin/bash

set -Eeuo pipefail

for f in matplotlib/examples/*.py; do
    without_extension="${f%.*}"
    basename_without_extension="${without_extension##*/}"

    echo "testing $basename_without_extension"
    err=$(python3 src/preview/renderer.py "{ \"style\": \"ggplot\", \"baseDir\": \"matplotlib\", \"example\": \"$basename_without_extension\" }" | jq .error)
    if [ "$err" != '""' ]; then
        echo "$err"
        exit 1
    fi
done

echo "ok"
