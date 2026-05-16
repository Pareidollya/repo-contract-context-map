# GET_PROJECT_CONTENT_TXT
Gerar arquivo .txt do completo para contextualizar um chatbot externo ao ambiente de desenvolvimento. No copilot? No problem rsrs.

Quando o chat começar a derreter so começar outro com o conteúdo completo do projeto.

Executar esse script na raiz do projeto retornará todo o conteúdo implementado em um unico arquivo TXT estruturado na arvore de arquivos. 

Sim, foi feito por IA mas resolve legal o problema para nós que não tem um puto pra assinar uma IA com grande janela de contexto rsrs... todo novo chat gratuito saberá o conteúdo completo do projeto! Gemini 3 se deu muito bem com isso!
- requires python

````md
# Extract

Simple Python utility to extract:

- Project directory trees
- Full source contents from selected file extensions

Designed for fast project inspection, LLM context generation, documentation snapshots, and codebase exporting.

No external dependencies required.

---

# Features

## Tree Mode

Exports only the directory structure.

Example:

```txt
src/
├── app
│   ├── main.ts
│   └── routes.ts
└── shared
    └── utils.ts
````

Generated file:

```txt
tree_project_src.txt
```

---

## Full Mode

Exports:

* Directory tree
* File contents

Useful for:

* AI/LLM context
* Code review
* Backups
* Documentation
* Repository snapshots

Generated file:

```txt
project_project_src.txt
```

---

# Usage

## Run Tree Mode

```bash
python extract.py --mode tree
```

or

```bash
python extract.py -m tree
```

---

## Run Full Mode

```bash
python extract.py --mode full
```

or

```bash
python extract.py -m full
```

---

# Configuration

Edit the `TARGET_DIRS` list:

```python
TARGET_DIRS = [
    "../affiliate-reactor/src",
    "../wa-agent/src",
    "../solid_front/src",
]
```

---

# Supported Extensions

Edit the `EXTENSIONS` tuple:

```python
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
```

Only these file types will be included in `full` mode.

---

# Ignored Directories

```python
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
```

---

# Output Naming

Example input:

```python
"../wa-agent/src"
```

Tree mode:

```txt
tree_wa-agent_src.txt
```

Full mode:

```txt
project_wa-agent_src.txt
```

---

# Requirements

* Python 3.10+
* Standard library only

No pip install required.

---

# Example Use Cases

* Feed repositories into LLMs
* Generate architecture snapshots
* Export source trees
* Create lightweight codebase documentation
* Analyze multi-project structures
* Share isolated source contexts

---

# License

MIT

```
```
