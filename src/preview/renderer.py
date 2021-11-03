import json


def plot():
    # https://github.com/matplotlib/matplotlib/blob/8ba4f2b3833a80a754ca0d52a6e2c695207de771/examples/lines_bars_and_markers/markevery_prop_cycle.py#L1-L1
    import matplotlib.pyplot as plt
    import numpy as np

    # Define a list of markevery cases and color cases to plot
    cases = [None, 8, (30, 8), [16, 24, 30], [0, -1], slice(100, 200, 3), 0.1, 0.3, 1.5, (0.0, 0.1), (0.45, 0.1)]

    # Create data points and offsets
    x = np.linspace(0, 2 * np.pi)
    offsets = np.linspace(0, 2 * np.pi, 11, endpoint=False)
    yy = np.transpose([np.sin(x + phi) for phi in offsets])

    # Set the plot curve with markers and a title
    fig = plt.figure()
    ax = fig.add_axes([0.1, 0.1, 0.6, 0.75])

    for i in range(len(cases)):
        ax.plot(yy[:, i], marker='o', label=str(cases[i]))
        ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left', borderaxespad=0.)

    plt.title('Support for axes.prop_cycle cycler with markevery')


try:
    import warnings

    warning_list = []

    def showwarning(message, category, filename, lineno, file=None, line=None):
        warning_list.append(warnings.formatwarning(message, category, filename, lineno, line))

    warnings.showwarning = showwarning

    import io
    import logging
    logging_io = io.StringIO()
    logging.basicConfig(stream=logging_io)

    import sys

    import matplotlib
    import matplotlib.pyplot as plt

    plt.style.use(sys.argv[1])

    plot()
    svg = io.BytesIO()
    plt.savefig(svg, format="svg")

    print(json.dumps({
        "svg": svg.getvalue().decode("utf-8"),
        "error": (logging_io.getvalue() + "\n" + "\n".join(warning_list)).strip(),
        "matplotlib": {"version": matplotlib.__version__},
        "python": {"version": ".".join(map(str, sys.version_info[:3]))},
    }))
except Exception as err:
    import traceback
    print(json.dumps({
        "error": traceback.format_exc(),
    }))
