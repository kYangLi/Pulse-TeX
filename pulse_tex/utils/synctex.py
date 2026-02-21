import gzip
import re
from pathlib import Path


class SyncTeXParser:
    def __init__(self, synctex_path: str | Path):
        self.synctex_path = Path(synctex_path)
        self._data: dict = {}
        self._parse()

    def _parse(self):
        if not self.synctex_path.exists():
            alt_path = Path(str(self.synctex_path) + ".gz")
            if alt_path.exists():
                self.synctex_path = alt_path

        if not self.synctex_path.exists():
            return

        content = self._read_content()
        self._parse_content(content)

    def _read_content(self) -> str:
        if str(self.synctex_path).endswith(".gz"):
            with gzip.open(self.synctex_path, "rt", encoding="latin-1") as f:
                return f.read()
        else:
            with open(self.synctex_path, "r", encoding="latin-1") as f:
                return f.read()

    def _parse_content(self, content: str):
        self._data = {
            "inputs": [],
            "pages": {},
        }

        current_input = None
        current_page = None

        for line in content.split("\n"):
            if line.startswith("Input:"):
                input_path = line[6:].strip()
                self._data["inputs"].append(input_path)

            elif line.startswith("{"):
                match = re.match(r"\{(\d+)", line)
                if match:
                    current_page = int(match.group(1))
                    if current_page not in self._data["pages"]:
                        self._data["pages"][current_page] = []

            elif line.startswith("[") and current_page is not None:
                parts = line[1:].split(",")
                if len(parts) >= 5:
                    try:
                        self._data["pages"][current_page].append(
                            {
                                "line": int(parts[0]),
                                "column": int(parts[1]) if len(parts) > 1 else 0,
                                "h": float(parts[2]) if len(parts) > 2 else 0,
                                "v": float(parts[3]) if len(parts) > 3 else 0,
                                "w": float(parts[4]) if len(parts) > 4 else 0,
                            }
                        )
                    except (ValueError, IndexError):
                        pass

    def get_page_for_line(self, filename: str, line: int) -> int | None:
        for page, entries in self._data.get("pages", {}).items():
            for entry in entries:
                if entry.get("line") == line:
                    return page
        return None

    def get_position_for_line(self, filename: str, line: int) -> tuple[int, float, float] | None:
        for page, entries in self._data.get("pages", {}).items():
            for entry in entries:
                if entry.get("line") == line:
                    return (page, entry.get("h", 0), entry.get("v", 0))
        return None

    def get_line_for_position(self, page: int, x: float, y: float) -> int | None:
        entries = self._data.get("pages", {}).get(page, [])
        if not entries:
            return None

        min_dist = float("inf")
        closest_line = None

        for entry in entries:
            dist = abs(entry.get("v", 0) - y)
            if dist < min_dist:
                min_dist = dist
                closest_line = entry.get("line")

        return closest_line

    @property
    def is_valid(self) -> bool:
        return bool(self._data.get("pages"))


def parse_synctex(synctex_path: str | Path) -> SyncTeXParser:
    return SyncTeXParser(synctex_path)
