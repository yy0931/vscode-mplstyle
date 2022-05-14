import json
from pathlib import Path
from typing import Any

import matplotlib.colors
from matplotlib.cm import _cmap_registry  # type: ignore


def json_dump_compact(obj: Any):
    # https://stackoverflow.com/a/29066406/10710682
    # https://stackoverflow.com/a/16311587/10710682
    return json.dumps(json.loads(json.dumps(obj), parse_float=lambda x: round(float(x), 3)), separators=(',', ':'))


(Path(__file__).parent.parent / "matplotlib" / "colors.json").write_text(json_dump_compact({k: [x for x in matplotlib.colors.to_rgba(v)] for k, v in matplotlib.colors.get_named_colors_mapping().items()}))
(Path(__file__).parent.parent / "matplotlib" / "cm.json").write_text(json_dump_compact(list(_cmap_registry.keys())))
