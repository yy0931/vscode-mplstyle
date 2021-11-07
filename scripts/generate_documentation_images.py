from __future__ import annotations

import io
import shutil
from pathlib import Path
from typing import Callable

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import PIL.Image
from matplotlib.axes import Axes
from matplotlib.figure import Figure

out_dir = Path(__file__).parent.parent / "example"


def savefig(out_file: Path):
    # Render the figure
    f = io.BytesIO()
    plt.savefig(f, format="png")
    im = PIL.Image.open(f)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Crop the image
    im = im.crop(im.getbbox())
    im.save(out_file)
    plt.close()


def plot_axes_simple(ax: Axes, title: str):
    x1 = np.linspace(0.0, 5.0)
    y1 = np.cos(2 * np.pi * x1) * np.exp(-x1)
    ax.plot(x1, y1)
    ax.set_xlabel('xlabel')
    ax.set_ylabel('ylabel')
    ax.set_title(title)


def plot_axes_legend(ax: Axes, title: str):
    x = np.linspace(0, 1, num=8)
    for (n, marker) in ((1, "o"), (2, "^")):
        ax.plot(x, x**n, label="n={0}".format(n), marker=marker)
    ax.legend().set_title("legend title")
    ax.set_xlabel('xlabel')
    ax.set_ylabel('ylabel')
    ax.set_title(title)


def render_figure(plot_axes: Callable[[Axes, str], None], key: str, value: str, defaults: list[tuple[str, str]]):
    """https://matplotlib.org/stable/gallery/subplots_axes_and_figures/subplot.html"""

    def render_fig():
        fig: Figure
        fig = plt.figure()
        with matplotlib.rc_context({key: value}):
            plot_axes(fig.add_subplot(121), matplotlib.rcParams[key])  # type: ignore
        plot_axes(fig.add_subplot(122), matplotlib.rcParams[key])  # type: ignore

        f = io.BytesIO()
        plt.savefig(f, format="png")
        plt.close()
        return PIL.Image.open(f)

    with matplotlib.rc_context({k: v for k, v in defaults}):
        with matplotlib.rc_context({"figure.facecolor": "none"}):
            bbox = render_fig().getbbox()
        out_dir.mkdir(parents=True, exist_ok=True)
        render_fig().crop(bbox).save(out_dir / f"{key}.png")


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


def parse_config(config: str):
    for line in config.splitlines():
        if line.strip() == "":
            continue

        values: list[tuple[str, str]] = []
        for pair in line.split(";"):
            k, v = pair.split(":", 1)
            values.append((k.strip(), v.strip()))
        yield values


for values in parse_config("""
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
grid.linewidth: 4; axes.grid: True
font.size: 15
"""):
    render_figure(plot_axes_simple, *values[0], values[1:])

todo = """
legend.columnspacing: 10
legend.fancybox: False
legend.scatterpoints: 2
"""

for values in parse_config("""
legend.loc: center
legend.frameon: False
legend.framealpha: 0.2; axes.facecolor: lightgreen; legend.edgecolor: black
legend.facecolor: lightgreen
legend.edgecolor: green
legend.shadow: True
legend.fontsize: xx-small
legend.title_fontsize: 15
legend.borderpad: 2
legend.labelspacing: 2.5
legend.handlelength: 10
legend.handleheight: 3.5
legend.handletextpad: 4
legend.borderaxespad: 2.5
legend.numpoints: 2
legend.markerscale: 2.0
"""):
    render_figure(plot_axes_legend, *values[0], values[1:])

(out_dir / "index.txt").write_text("\n".join(f.name for f in out_dir.iterdir()))
