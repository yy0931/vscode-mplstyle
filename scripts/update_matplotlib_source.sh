#!/bin/bash

set -Eeuo pipefail

REPO=https://raw.githubusercontent.com/matplotlib/matplotlib/main
curl "$REPO/lib/matplotlib/rcsetup.py" --create-dirs -o matplotlib/lib/matplotlib/rcsetup.py
curl "$REPO/lib/matplotlib/mpl-data/matplotlibrc" --create-dirs -o matplotlib/lib/matplotlib/mpl-data/matplotlibrc
curl "$REPO/LICENSE/LICENSE" --create-dirs -o matplotlib/LICENSE/LICENSE
