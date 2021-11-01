from __future__ import annotations

import io
import shutil
from pathlib import Path

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import PIL.Image
from matplotlib.axes import Axes
from matplotlib.figure import Figure

x1 = np.linspace(0.0, 5.0)
y1 = np.cos(2 * np.pi * x1) * np.exp(-x1)

out_dir = Path(__file__).parent.parent / "example"


def plot(key: str, value: str, defaults: list[tuple[str, str]]):
    fig: Figure
    ax: Axes

    with matplotlib.rc_context({k: v for k, v in defaults}):
        fig = plt.figure()

        ax = fig.add_subplot(121)  # type: ignore
        ax.plot(x1, y1)
        ax.set_xlabel('xlabel')
        ax.set_ylabel('ylabel')
        ax.set_title(matplotlib.rcParams[key])

        with matplotlib.rc_context({key: value}):
            ax = fig.add_subplot(122)  # type: ignore
            ax.plot(x1, y1)
            ax.set_xlabel('xlabel')
            ax.set_ylabel('ylabel')
            ax.set_title(matplotlib.rcParams[key])

        # suptitle = key
        # if len(defaults) > 0:
        #     suptitle += f'\n({"; ".join([f"{k}: {v}" for k, v in defaults])})'
        # fig.suptitle(suptitle)

        f = io.BytesIO()
        out_dir.mkdir(parents=True, exist_ok=True)
        plt.savefig(f, format="png")
        im = PIL.Image.open(f)
        im.crop(im.getbbox()).save(out_dir / f"{key}.png")
        plt.close()


shutil.rmtree(out_dir, ignore_errors=True)

plt.style.use(Path(__file__).parent / 'default.mplstyle')

todo = """
axes.autolimit_mode: round_numbers
axes.axisbelow: False
axes.formatter.limits: -1, 1
axes.formatter.min_exponent: 5
axes.formatter.offset_threshold: 2
axes.formatter.use_locale: True
axes.formatter.use_mathtext: True
axes.formatter.useoffset: False
axes.unicode_minus: False
axes.zmargin: 0.3
axes3d.grid: False
polaraxes.grid: False
lines.color: red
lines.dash_capstyle: projecting
lines.dash_joinstyle: bevel
pcolor.shading: flat
pcolormesh.snap: False
lines.solid_capstyle: round
lines.solid_joinstyle: miter
"""

style = """
axes.edgecolor: green;axes.linewidth: 1.5
axes.facecolor: lightgreen
axes.grid: True
axes.grid.which: both;axes.grid: True;xtick.minor.visible: True
axes.labelcolor: green
axes.labelpad: 10.0;axes.labelpad: 0
axes.labelsize: xx-small
axes.labelweight: bold
axes.linewidth: 5
axes.prop_cycle: cycler(color=['red', 'blue'])
axes.spines.bottom: False
axes.spines.left: False
axes.spines.right: False
axes.spines.top: False
axes.titlecolor: green
axes.titlelocation: left
axes.titlepad: 20.0
axes.titlesize: xx-small
axes.titleweight: bold
axes.titley: 0.2;axes.titley: 1
axes.grid.axis: x; axes.grid: True
axes.xmargin: 0.5
axes.ymargin: 0.5
lines.antialiased: False
lines.dashdot_pattern: 8, 1, 1, 8; lines.linestyle: dashdot
lines.dashed_pattern: 8, 1; lines.linestyle: dashed
lines.dotted_pattern: 1, 4; lines.linestyle: dotted
lines.linestyle: --
lines.linewidth: 4.5
lines.marker: o
lines.markeredgecolor: lightgreen;lines.marker: o
lines.markeredgewidth: 2.0;lines.marker: o;lines.markeredgecolor: lightgreen
lines.markerfacecolor: lightgreen;lines.marker: o
lines.markersize: 12;lines.marker: o
lines.scale_dashes: False;lines.linestyle: dashed
markers.fillstyle: bottom;lines.marker: o;lines.markeredgecolor: lightgreen
"""

for line in style.splitlines():
    if line.strip() == "":
        continue

    values: list[tuple[str, str]] = []
    for pair in line.split(";"):
        k, v = pair.split(":", 1)
        values.append((k.strip(), v.strip()))
    plot(*values[0], values[1:])
