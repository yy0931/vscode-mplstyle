import json

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

    plt.plot([1, 2], [3, 4])
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
