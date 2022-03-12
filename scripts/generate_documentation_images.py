from __future__ import annotations

import io
import multiprocessing
import shutil
from pathlib import Path
from typing import Callable, Sequence

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import PIL.Image
from matplotlib.axes import Axes
from matplotlib.figure import Figure

out_dir = Path(__file__).parent.parent / "example"


def plot_capstyle_simple(args: Sequence[tuple[str, str]]):
    def f(ax: Axes, title: str):
        ax.plot([1, 2.5, 4], [0.4, 0, 0.3])
        ax.set_xlabel('xlabel')
        ax.set_ylabel('ylabel')
        ax.set_title(title)
    render_figure(f, *args[0], args[1:])


def plot_axes_simple(args: Sequence[tuple[str, str]]):
    def f(ax: Axes, title: str):
        x1 = np.linspace(0.0, 5.0)
        y1 = np.cos(2 * np.pi * x1) * np.exp(-x1)
        ax.plot(x1, y1)
        ax.set_xlabel('xlabel')
        ax.set_ylabel('ylabel')
        ax.set_title(title)
    render_figure(f, *args[0], args[1:])


def plot_axes_legend(args: Sequence[tuple[str, str]]):
    def f(ax: Axes, title: str):
        x = np.linspace(0, 1, num=8)
        for (n, marker) in ((1, "o"), (2, "^")):
            ax.plot(x, x**n, label="n={0}".format(n), marker=marker)
        ax.legend().set_title("legend title")
        ax.set_xlabel('xlabel')
        ax.set_ylabel('ylabel')
        ax.set_title(title)
    render_figure(f, *args[0], args[1:])


def plot_axes_legend_col2(args: Sequence[tuple[str, str]]):
    def f(ax: Axes, title: str):
        x = np.linspace(0, 1, num=8)
        for (n, marker) in ((1, "o"), (2, "^")):
            ax.plot(x, x**n, label="n={0}".format(n), marker=marker)
        ax.legend(ncol=2).set_title("legend title")
        ax.set_xlabel('xlabel')
        ax.set_ylabel('ylabel')
        ax.set_title(title)
    render_figure(f, *args[0], args[1:])


def initialize_worker():
    plt.style.use(Path(__file__).parent / 'documentation-images.mplstyle')


def render_figure(plot_axes: Callable[[Axes, str], None], key: str, value: str, defaults: Sequence[tuple[str, str]]):
    """https://matplotlib.org/stable/gallery/subplots_axes_and_figures/subplot.html"""
    def render_fig():
        fig: Figure = plt.figure()
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
        render_fig().crop(bbox).save(out_dir / f"{key}.png")


def parse_config(config: str):
    for line in config.splitlines():
        if line.strip() == "":
            continue

        values: list[tuple[str, str]] = []
        for pair in line.split(";"):
            k, v = pair.split(":", 1)
            values.append((k.strip(), v.strip()))
        yield values


if __name__ == "__main__":
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True)

    todo = """
axes.autolimit_mode: round_numbers
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
pcolor.shading: flat
pcolormesh.snap: False
xtick.major.top: False
xtick.minor.pad: 6.8;      xtick.minor.visible: True; ytick.minor.visible: True
xtick.minor.size: 4;       xtick.minor.visible: True; ytick.minor.visible: True
xtick.minor.top: False;    xtick.minor.visible: True; ytick.minor.visible: True
ytick.major.right: False
ytick.minor.pad: 6.8;      xtick.minor.visible: True; ytick.minor.visible: True
ytick.minor.right: False;  xtick.minor.visible: True; ytick.minor.visible: True
"""

    with multiprocessing.Pool(initializer=initialize_worker) as p:
        p.map(plot_axes_simple, parse_config("""
axes.edgecolor: green; axes.linewidth: 1.5
axes.facecolor: lightgreen
axes.grid: True
axes.grid.which: both; axes.grid: True; xtick.minor.visible: True
axes.labelcolor: green
axes.labelpad: 10.0; axes.labelpad: 0
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
axes.titley: 0.2; axes.titley: 1
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
lines.markeredgecolor: lightgreen; lines.marker: o
lines.markeredgewidth: 2.0; lines.marker: o; lines.markeredgecolor: lightgreen
lines.markerfacecolor: lightgreen; lines.marker: o
lines.markersize: 12; lines.marker: o
lines.scale_dashes: False; lines.linestyle: dashed
markers.fillstyle: bottom; lines.marker: o; lines.markeredgecolor: lightgreen
grid.linewidth: 4; axes.grid: True
font.size: 15
axes.axisbelow: False; axes.axisbelow: True; lines.linewidth: 5; grid.color: black; axes.grid: True
xtick.top: True
ytick.left: False
xtick.bottom: False
ytick.right: True
xtick.labeltop: True
ytick.labelleft: False
xtick.labelbottom: False
ytick.labelright: True
xtick.major.size: 14
ytick.major.size: 14
xtick.major.width: 5
ytick.major.width: 5
xtick.color: green
ytick.color: green
xtick.labelcolor: green
ytick.labelcolor: green
xtick.labelsize: xx-large
ytick.labelsize: xx-large
xtick.direction: in
ytick.direction: in
xtick.minor.visible: True
ytick.minor.visible: True
xtick.major.bottom: False
xtick.alignment: left
ytick.alignment: top
xtick.major.pad: 15
ytick.major.pad: 15
ytick.major.left: False
xtick.minor.bottom: False; xtick.minor.visible: True; ytick.minor.visible: True
ytick.minor.size: 4;       xtick.minor.visible: True; ytick.minor.visible: True
xtick.minor.width: 5;      xtick.minor.visible: True; ytick.minor.visible: True
ytick.minor.width: 5;      xtick.minor.visible: True; ytick.minor.visible: True
ytick.minor.left: False;   xtick.minor.visible: True; ytick.minor.visible: True
"""))

        p.map(plot_capstyle_simple, parse_config("""
lines.solid_capstyle: round; lines.linewidth: 15; axes.xmargin: 0.5; axes.ymargin: 0.3
lines.solid_joinstyle: miter; lines.linewidth: 15; axes.xmargin: 0.5; axes.ymargin: 0.3
lines.dash_capstyle: round; lines.linestyle: dashed; lines.linewidth: 5; lines.linewidth: 10
lines.dash_joinstyle: miter; lines.linestyle: dashed; lines.linewidth: 5; lines.linewidth: 10; axes.xmargin: 0.2; axes.ymargin: 0.3
"""))

        todo = """
legend.scatterpoints: 2
"""

        p.map(plot_axes_legend, parse_config("""
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
legend.fancybox: False; legend.edgecolor: green
"""))
        p.map(plot_axes_legend_col2, parse_config("""
legend.columnspacing: 4
"""))

    (out_dir / "index.txt").write_text("\n".join(f.name for f in out_dir.iterdir()))
