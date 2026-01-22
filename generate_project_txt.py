import os
from pathlib import Path
import pathspec

ROOT_DIR = Path(".").resolve()
OUTPUT_FILE = "project.txt"

TARGET_EXTENSIONS = ("ts", "prisma")

BLACKLIST_FILE = "py_blacklist_files.txt"


def load_blacklist(root_dir: Path) -> pathspec.PathSpec:
    blacklist_path = root_dir / BLACKLIST_FILE

    if not blacklist_path.exists():
        return pathspec.PathSpec.from_lines("gitwildmatch", [])

    with open(blacklist_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    return pathspec.PathSpec.from_lines("gitwildmatch", lines)


def is_ignored(path: Path, spec: pathspec.PathSpec) -> bool:
    try:
        relative_path = path.relative_to(ROOT_DIR)
    except ValueError:
        return False

    return spec.match_file(str(relative_path))


def generate_project_tree(root_dir: Path, spec: pathspec.PathSpec) -> list[str]:
    tree_lines = []

    def walk(dir_path: Path, prefix: str = ""):
        entries = sorted(dir_path.iterdir(), key=lambda p: p.name)
        visible_entries = [
            e for e in entries
            if not is_ignored(e, spec)
        ]

        for index, entry in enumerate(visible_entries):
            is_last = index == len(visible_entries) - 1
            connector = "└─ " if is_last else "├─ "
            tree_lines.append(f"{prefix}{connector}{entry.name}")

            if entry.is_dir():
                extension = "   " if is_last else "│  "
                walk(entry, prefix + extension)

    tree_lines.append(f"{root_dir.name}/")
    walk(root_dir)

    return tree_lines


def should_include_file(filename: str, target_extensions: tuple[str, ...]) -> bool:
    """
    Decide se o arquivo deve ser incluído baseado na lista de extensões.
    A tupla deve conter extensões sem ponto: ex ("ts", "py").
    """
    suffix = Path(filename).suffix.lower()  # inclui o ponto: ".ts"
    if not suffix:
        return False

    ext = suffix[1:]  # remove o ponto
    return ext in target_extensions


def write_file_contents(root_dir: Path, spec: pathspec.PathSpec, out):
    for current_root, dirs, files in os.walk(root_dir):
        current_root = Path(current_root)

        dirs[:] = sorted([
            d for d in dirs
            if not is_ignored(current_root / d, spec)
        ])

        level = len(current_root.relative_to(root_dir).parts)
        indent = "    " * level
        out.write(f"{indent}{current_root.name}\n")

        for file in sorted(files):
            file_path = current_root / file

            if is_ignored(file_path, spec):
                continue

            if not should_include_file(file, TARGET_EXTENSIONS):
                continue

            file_indent = "    " * (level + 1)
            out.write(f"{file_indent}{file_path}\n")

            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception as e:
                content = f"<<Error reading file: {e}>>"

            content_indent = "    " * (level + 2)
            for line in content.splitlines():
                out.write(f"{content_indent}{line}\n")

            out.write("\n")


def main():
    spec = load_blacklist(ROOT_DIR)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write("=== PROJECT TREE ===\n")
        for line in generate_project_tree(ROOT_DIR, spec):
            out.write(line + "\n")

        out.write("\n=== FILE CONTENTS ===\n\n")
        write_file_contents(ROOT_DIR, spec, out)

    print(f"File '{OUTPUT_FILE}' generated successfully.")


if __name__ == "__main__":
    main()
