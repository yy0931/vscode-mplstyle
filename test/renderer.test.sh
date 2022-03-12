#!/bin/bash

set -Eeuo pipefail

render() {
    local f=$1
    local without_extension="${f%.*}"
    local basename_without_extension="${without_extension##*/}"

    echo "Testing $basename_without_extension"
    local err=$(python3 src/preview/renderer.py "{ \"style\": \"ggplot\", \"activePlot\": { \"path\": \"matplotlib/examples/$basename_without_extension\" } }" | jq .error)
    if [ "$err" != '""' ]; then
        echo "Error during rendering $f"
        echo "$err"
        exit 1
    fi
}

declare -a pids=()
for f in matplotlib/examples/*.py; do
    render $f &
    pids[${#pids[@]}]=$!
done
for pid in ${pids[*]}; do
    wait $pid
done
echo "Passed"
