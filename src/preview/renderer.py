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

    import importlib
    import sys

    import matplotlib
    import matplotlib.pyplot as plt

    savefig = plt.savefig
    svg = io.BytesIO()

    plt.show = lambda *args, **kwargs: savefig(svg, format="svg")
    plt.savefig = lambda *args, **kwargs: None

    # argv = [_, style, example, extensionPath / "matplotlib"]
    args = json.loads(sys.argv[1])
    plt.style.use(args["style"])
    sys.path.append(args["baseDir"])
    importlib.import_module(f"examples.{args['example']}")

    print(json.dumps({
        "svg": svg.getvalue().decode("utf-8"),
        "error": (logging_io.getvalue() + "\n" + "\n".join(warning_list)).strip(),
        "version": f"Python {'.'.join(map(str, sys.version_info[:3]))}, Matplotlib {matplotlib.__version__}"
    }))
except Exception as err:
    import traceback
    print(json.dumps({
        "error": traceback.format_exc(),
    }))
