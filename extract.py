import argparse
from pathlib import Path

TARGET_DIRS = [
    "../project_1",
    "../project_2",
    "../front",
]

EXTENSIONS = (
    "txt",
    "schema",
    "ts",
    "tsx",
    "js",
    "jsx",
    "py",
    "json",
    "md",
    "prisma",
    "env",
    "yml",
    "yaml",
)

IGNORE_DIRS = {
    ".git",
    "__pycache__",
    "node_modules",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
}

IGNORE_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
}


def output_name(target: str, mode: str) -> str:
    clean = target.replace("\\", "/")

    while clean.startswith("../"):
        clean = clean[3:]

    while clean.startswith("./"):
        clean = clean[2:]

    name = clean.replace("/", "_")
    prefix = "tree" if mode == "tree" else "project"

    return f"{prefix}_{name}.txt"


def should_ignore(path: Path) -> bool:
    return path.name in IGNORE_DIRS or path.name in IGNORE_FILES


def should_read_file(path: Path) -> bool:
    suffix = path.suffix.lower().lstrip(".")
    return suffix in EXTENSIONS


def get_entries(path: Path) -> list[Path]:
    return sorted(
        [p for p in path.iterdir() if not should_ignore(p)],
        key=lambda p: (not p.is_dir(), p.name.lower()),
    )


def write_tree(path: Path, out, prefix: str = ""):
    entries = get_entries(path)

    for index, entry in enumerate(entries):
        is_last = index == len(entries) - 1
        connector = "└── " if is_last else "├── "

        out.write(f"{prefix}{connector}{entry.name}\n")

        if entry.is_dir():
            extension = "    " if is_last else "│   "
            write_tree(entry, out, prefix + extension)


def write_contents(path: Path, out):
    for file_path in sorted(path.rglob("*")):
        if any(part in IGNORE_DIRS for part in file_path.parts):
            continue

        if not file_path.is_file():
            continue

        if should_ignore(file_path):
            continue

        if not should_read_file(file_path):
            continue

        relative = file_path.relative_to(path)

        out.write(f"\n\n--- FILE: {relative} ---\n\n")

        try:
            content = file_path.read_text(encoding="utf-8")
        except Exception as error:
            content = f"<<Erro ao ler arquivo: {error}>>"

        out.write(content)


def extract(target: str, mode: str):
    path = Path(target).resolve()

    if not path.exists() or not path.is_dir():
        print(f"Ignorado: {target}")
        return

    out_file = output_name(target, mode)

    with open(out_file, "w", encoding="utf-8") as out:
        out.write(f"{path.name}/\n")
        write_tree(path, out)

        if mode == "full":
            out.write("\n\FILE CONTENTS")
            write_contents(path, out)

    print(f"Gerado: {out_file}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "-m",
        "--mode",
        choices=("tree", "full"),
        default="tree",
        help="Extracition mode: tree only or full content",
    )

    args = parser.parse_args()

    for target in TARGET_DIRS:
        extract(target, args.mode)


if __name__ == "__main__":
    main()
