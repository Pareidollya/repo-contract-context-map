import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import * as ts from 'typescript';

/**
 * Contract Context Map
 *
 * Discovery and extraction stay separate by design:
 * 1. ripgrep returns only paths allowed by contract, port, and schema rules.
 * 2. Node.js reads only those matched files.
 * 3. Renderer writes one compact Markdown snapshot with verified line ranges.
 *
 * This keeps repository scans small while producing a portable document for
 * assistants that cannot access the source repository directly.
 */

// JSON configuration mirrors this type. Arrays replace defaults instead of merging.
type ExtractorConfig = {
  name?: string;
  roots: string[];
  output?: string;
  outputDir: string;
  contractDirectories: string[];
  extensions: string[];
  schemaGlobs: string[];
  excludeGlobs: string[];
  moduleMarkers: string[];
  compact: boolean;
};

type CliOptions = {
  target?: string;
  configPath?: string;
  output?: string;
  compact?: boolean;
  help: boolean;
};

type LocatedFile = {
  absolutePath: string;
  rootPath: string;
  relativePath: string;
  displayPath: string;
};

type ExtractedFile = LocatedFile & {
  module: string;
  kind: string;
  language: string;
  content: string;
};

type FileOffset = {
  path: string;
  startOffset: number;
  endOffset: number;
};

type ModuleBlock = {
  module: string;
  lines: string[];
  endOffset: number;
  files: FileOffset[];
};

type LineRange = {
  start: number;
  end: number;
};

type ResolvedRanges = {
  modules: Map<string, LineRange>;
  files: Map<string, LineRange>;
};

// Defaults are intentionally conservative. Users can add DTO, entity, interface,
// or framework-specific directory names through extract-contracts.json.
const DEFAULT_CONFIG: ExtractorConfig = {
  roots: ['.'],
  outputDir: '.',
  contractDirectories: ['contracts', 'ports'],
  extensions: [
    'ts',
    'tsx',
    'mts',
    'cts',
    'js',
    'jsx',
    'py',
    'go',
    'rs',
    'java',
    'kt',
    'kts',
    'cs',
    'proto',
    'graphql',
    'gql',
    'json',
    'yaml',
    'yml',
    'toml',
    'prisma',
    'sql',
    'md',
  ],
  schemaGlobs: ['**/*.schema', '**/*.schema.*', '**/schema.prisma', '**/schema.sql'],
  excludeGlobs: [
    '**/*.spec.*',
    '**/*.test.*',
    '**/.git/**',
    '**/.next/**',
    '**/.venv/**',
    '**/__pycache__/**',
    '**/node_modules/**',
    '**/vendor/**',
    '**/coverage/**',
    '**/dist/**',
    '**/build/**',
    '**/target/**',
    '**/bin/**',
    '**/obj/**',
    '**/generated/**',
    '**/migrations/**',
  ],
  moduleMarkers: ['modules', 'domains'],
  compact: true,
};

const CONFIG_KEYS = new Set<keyof ExtractorConfig>([
  'name',
  'roots',
  'output',
  'outputDir',
  'contractDirectories',
  'extensions',
  'schemaGlobs',
  'excludeGlobs',
  'moduleMarkers',
  'compact',
]);

const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx']);

function printHelp(): void {
  console.log(`Extract contract, port, and schema context into one Markdown document.

Usage:
  pnpm extract -- <target>
  pnpm extract -- <target> --output <file>
  pnpm extract -- --config <file>

Options:
  --config <file>  Load optional JSON overrides.
  --output <file>  Override the generated Markdown path.
  --raw            Preserve source formatting.
  --help            Show this help.

Configuration precedence: built-in defaults, JSON overrides, CLI overrides.`);
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parseCli(args: string[]): CliOptions {
  const options: CliOptions = { help: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--') {
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--raw') {
      options.compact = false;
      continue;
    }
    if (argument === '--config') {
      options.configPath = readOptionValue(args, index, '--config');
      index += 1;
      continue;
    }
    if (argument === '--output') {
      options.output = readOptionValue(args, index, '--output');
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (options.target) {
      throw new Error(`Only one positional target is supported. Unexpected target: ${argument}`);
    }
    options.target = argument;
  }

  return options;
}

function requireString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Configuration field "${key}" must be a non-empty string.`);
  }
  return value;
}

function requireStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`Configuration field "${key}" must be a non-empty string array.`);
  }
  return [...value];
}

function validateOverrides(value: unknown): Partial<ExtractorConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Extractor configuration must be a JSON object.');
  }

  const input = value as Record<string, unknown>;
  const unknownKeys = Object.keys(input).filter((key) => !CONFIG_KEYS.has(key as keyof ExtractorConfig));
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown configuration field(s): ${unknownKeys.join(', ')}`);
  }

  const result: Partial<ExtractorConfig> = {};
  if (input.name !== undefined) result.name = requireString(input.name, 'name');
  if (input.output !== undefined) result.output = requireString(input.output, 'output');
  if (input.outputDir !== undefined) result.outputDir = requireString(input.outputDir, 'outputDir');
  if (input.roots !== undefined) result.roots = requireStringArray(input.roots, 'roots');
  if (input.contractDirectories !== undefined) {
    result.contractDirectories = requireStringArray(input.contractDirectories, 'contractDirectories');
  }
  if (input.extensions !== undefined) result.extensions = requireStringArray(input.extensions, 'extensions');
  if (input.schemaGlobs !== undefined) result.schemaGlobs = requireStringArray(input.schemaGlobs, 'schemaGlobs');
  if (input.excludeGlobs !== undefined) result.excludeGlobs = requireStringArray(input.excludeGlobs, 'excludeGlobs');
  if (input.moduleMarkers !== undefined) result.moduleMarkers = requireStringArray(input.moduleMarkers, 'moduleMarkers');
  if (input.compact !== undefined) {
    if (typeof input.compact !== 'boolean') {
      throw new Error('Configuration field "compact" must be a boolean.');
    }
    result.compact = input.compact;
  }

  return result;
}

async function loadConfig(cwd: string, cli: CliOptions): Promise<ExtractorConfig> {
  // Explicit --config wins. Otherwise repository-local configuration is automatic.
  const automaticConfig = path.join(cwd, 'extract-contracts.json');
  const requestedConfig = cli.configPath ? path.resolve(cwd, cli.configPath) : undefined;
  const configPath = requestedConfig ?? (existsSync(automaticConfig) ? automaticConfig : undefined);
  let overrides: Partial<ExtractorConfig> = {};

  if (configPath) {
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    const source = await readFile(configPath, 'utf8');
    try {
      overrides = validateOverrides(JSON.parse(source));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid configuration file ${configPath}: ${message}`);
    }
  }

  const config: ExtractorConfig = { ...DEFAULT_CONFIG, ...overrides };
  if (cli.target) config.roots = [cli.target];
  if (cli.output) config.output = cli.output;
  if (cli.compact !== undefined) config.compact = cli.compact;
  return config;
}

function toPosix(value: string): string {
  return value.replaceAll(path.sep, '/');
}

function normalizeExtension(value: string): string {
  return value.replace(/^\./, '');
}

function buildIncludeGlobs(config: ExtractorConfig): string[] {
  // Precise include globs prevent traversal results outside requested semantic folders.
  const globs = new Set<string>();
  for (const directory of config.contractDirectories) {
    const normalizedDirectory = toPosix(directory).replace(/^\/+|\/+$/g, '');
    for (const extension of config.extensions) {
      globs.add(`**/${normalizedDirectory}/**/*.${normalizeExtension(extension)}`);
    }
  }
  for (const schemaGlob of config.schemaGlobs) globs.add(toPosix(schemaGlob));
  return [...globs];
}

async function resolveRoots(cwd: string, roots: string[]): Promise<string[]> {
  const resolved = roots.map((root) => path.resolve(cwd, root));
  for (const root of resolved) {
    let rootStat;
    try {
      rootStat = await stat(root);
    } catch {
      throw new Error(`Target root not found: ${root}`);
    }
    if (!rootStat.isDirectory()) {
      throw new Error(`Target root is not a directory: ${root}`);
    }
  }
  return resolved;
}

function findFilesWithRipgrep(cwd: string, roots: string[], config: ExtractorConfig): string[] {
  // `rg --files` respects .gitignore and emits paths only. File contents are read later.
  const args = ['--files', '--null', '--color=never', '--no-messages'];
  for (const glob of buildIncludeGlobs(config)) args.push('--glob', glob);
  for (const glob of config.excludeGlobs) {
    const normalized = toPosix(glob);
    args.push('--glob', normalized.startsWith('!') ? normalized : `!${normalized}`);
  }
  args.push('--', ...roots);

  const result = spawnSync('rg', args, {
    cwd,
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
  });

  if (result.error) {
    const message = result.error.message.includes('ENOENT')
      ? 'ripgrep (rg) is required but was not found on PATH.'
      : result.error.message;
    throw new Error(message);
  }
  if (result.status !== 0 && result.status !== 1) {
    const stderr = result.stderr?.toString('utf8').trim();
    throw new Error(`ripgrep failed with exit code ${result.status}${stderr ? `: ${stderr}` : '.'}`);
  }

  const output = result.stdout?.toString('utf8') ?? '';
  const seen = new Map<string, string>();
  for (const item of output.split('\0')) {
    if (!item) continue;
    const absolute = path.resolve(cwd, item);
    const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
    if (!seen.has(key)) seen.set(key, absolute);
  }
  return [...seen.values()].sort((left, right) => toPosix(left).localeCompare(toPosix(right), 'en'));
}

function findOwningRoot(filePath: string, roots: string[]): string {
  const candidates = roots.filter((root) => {
    const relative = path.relative(root, filePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
  if (candidates.length === 0) {
    throw new Error(`Matched file is outside configured roots: ${filePath}`);
  }
  return candidates.sort((left, right) => right.length - left.length)[0];
}

function locateFile(cwd: string, filePath: string, roots: string[]): LocatedFile {
  const rootPath = findOwningRoot(filePath, roots);
  const relativePath = toPosix(path.relative(rootPath, filePath));
  const displayPath = roots.length === 1
    ? relativePath
    : `${path.basename(rootPath)}/${relativePath}`;
  return { absolutePath: filePath, rootPath, relativePath, displayPath: toPosix(displayPath) };
}

function classifyFile(file: LocatedFile, config: ExtractorConfig): { module: string; kind: string } {
  const segments = file.relativePath.split('/');
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const directoryNames = config.contractDirectories.map((directory) => toPosix(directory).split('/').at(-1)?.toLowerCase() ?? '');
  const directoryIndex = lowerSegments.findIndex((segment) => directoryNames.includes(segment));
  const markerIndex = lowerSegments.findIndex((segment) => config.moduleMarkers.some((marker) => marker.toLowerCase() === segment));

  const kind = directoryIndex >= 0 ? lowerSegments[directoryIndex] : 'schema';
  if (markerIndex >= 0 && segments[markerIndex + 1]) {
    return { module: segments[markerIndex + 1], kind };
  }
  if (directoryIndex > 0) {
    return { module: segments[directoryIndex - 1], kind };
  }
  return { module: kind === 'schema' ? 'database' : 'root', kind };
}

function collapseBlankLines(lines: string[]): string[] {
  const result: string[] = [];
  let blank = false;

  for (const originalLine of lines) {
    const line = originalLine.trimEnd();
    if (line.trim().length === 0) {
      if (result.length > 0 && !blank) result.push('');
      blank = true;
      continue;
    }
    result.push(line);
    blank = false;
  }

  while (result.at(-1) === '') result.pop();
  while (result[0] === '') result.shift();
  return result;
}

function compactText(source: string): string {
  return collapseBlankLines(source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')).join('\n');
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath).toLowerCase()) {
    case '.tsx': return ts.ScriptKind.TSX;
    case '.jsx': return ts.ScriptKind.JSX;
    case '.js': return ts.ScriptKind.JS;
    default: return ts.ScriptKind.TS;
  }
}

function compactTypeScript(source: string, filePath: string): { content: string; warning?: string } {
  // Compiler parsing removes import noise without fragile regular-expression parsing.
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );

  const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (parseDiagnostics.length > 0) {
    const diagnostic = parseDiagnostics[0];
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    return { content: compactText(source), warning: `TypeScript parse fallback for ${filePath}: ${message}` };
  }

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
  const declarations = sourceFile.statements
    .filter((statement) => !ts.isImportDeclaration(statement) && !ts.isImportEqualsDeclaration(statement) && !ts.isExportDeclaration(statement))
    .map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile))
    .join('\n\n');

  const compacted = declarations
    .replace(/^(\s*)export\s+default\s+/gm, '$1')
    .replace(/^(\s*)export\s+/gm, '$1')
    .replace(/^(\s*)declare\s+/gm, '$1')
    .replace(/;(\s*)$/gm, '$1');

  const lines = compactText(compacted).split('\n').map((line) => {
    const match = line.match(/^ +/);
    if (!match) return line;
    return `${' '.repeat(Math.floor(match[0].length / 2))}${line.slice(match[0].length)}`;
  });
  return { content: lines.join('\n') };
}

function languageFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const mapping: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.cs': 'csharp',
    '.proto': 'protobuf',
    '.graphql': 'graphql',
    '.gql': 'graphql',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.prisma': 'prisma',
    '.sql': 'sql',
    '.md': 'markdown',
  };
  return mapping[extension] ?? 'text';
}

async function extractFile(file: LocatedFile, config: ExtractorConfig, warnings: string[]): Promise<ExtractedFile | null> {
  const buffer = await readFile(file.absolutePath);
  if (buffer.includes(0)) {
    warnings.push(`Skipped binary file: ${file.displayPath}`);
    return null;
  }

  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    warnings.push(`Skipped non-UTF-8 file: ${file.displayPath}`);
    return null;
  }

  const classification = classifyFile(file, config);
  let content = compactText(source);
  if (config.compact && TYPESCRIPT_EXTENSIONS.has(path.extname(file.absolutePath).toLowerCase())) {
    const compacted = compactTypeScript(source, file.displayPath);
    content = compacted.content;
    if (compacted.warning) warnings.push(compacted.warning);
  }
  if (!content) {
    warnings.push(`Skipped empty file: ${file.displayPath}`);
    return null;
  }

  return {
    ...file,
    ...classification,
    content,
    language: languageFor(file.absolutePath),
  };
}

function kindOrder(kind: string): number {
  if (kind === 'contracts') return 0;
  if (kind === 'ports') return 1;
  if (kind === 'schema') return 2;
  return 3;
}

function compareExtractedFiles(left: ExtractedFile, right: ExtractedFile): number {
  if (left.module === 'database' && right.module !== 'database') return -1;
  if (right.module === 'database' && left.module !== 'database') return 1;
  const moduleComparison = left.module.localeCompare(right.module, 'en');
  if (moduleComparison !== 0) return moduleComparison;
  const kindComparison = kindOrder(left.kind) - kindOrder(right.kind);
  if (kindComparison !== 0) return kindComparison;
  return left.displayPath.localeCompare(right.displayPath, 'en');
}

function fenceFor(content: string): string {
  const runs = content.match(/`+/g) ?? [];
  const width = Math.max(3, ...runs.map((run) => run.length + 1));
  return '`'.repeat(width);
}

function renderFileLines(file: ExtractedFile): string[] {
  const fence = fenceFor(file.content);
  return [
    `### \`${file.displayPath}\``,
    '',
    `${fence}${file.language}`,
    ...file.content.split('\n'),
    fence,
  ];
}

function buildModuleBlocks(files: ExtractedFile[]): ModuleBlock[] {
  const groups = new Map<string, ExtractedFile[]>();
  for (const file of files) {
    const current = groups.get(file.module) ?? [];
    current.push(file);
    groups.set(file.module, current);
  }

  return [...groups.entries()].map(([module, moduleFiles]) => {
    const lines = [`## ${module}`, ''];
    const offsets: FileOffset[] = [];

    for (const file of moduleFiles) {
      const fileLines = renderFileLines(file);
      const startOffset = lines.length;
      lines.push(...fileLines);
      const endOffset = lines.length - 1;
      offsets.push({ path: file.displayPath, startOffset, endOffset });
      lines.push('');
    }

    return {
      module,
      lines,
      endOffset: Math.max(0, lines.length - 2),
      files: offsets,
    };
  });
}

function formatLine(line: number): string {
  return `L${String(line).padStart(5, '0')}`;
}

function renderMap(blocks: ModuleBlock[], ranges?: ResolvedRanges): string[] {
  const lines = ['## Content Map', ''];
  for (const block of blocks) {
    const moduleRange = ranges?.modules.get(block.module) ?? { start: 0, end: 0 };
    lines.push(`- \`${block.module}\`: ${formatLine(moduleRange.start)}-${formatLine(moduleRange.end)}`);
    for (const file of block.files) {
      const fileRange = ranges?.files.get(file.path) ?? { start: 0, end: 0 };
      lines.push(`  - \`${file.path}\`: ${formatLine(fileRange.start)}-${formatLine(fileRange.end)}`);
    }
  }
  lines.push('');
  return lines;
}

function resolveRanges(blocks: ModuleBlock[], firstBodyLine: number): ResolvedRanges {
  const modules = new Map<string, LineRange>();
  const files = new Map<string, LineRange>();
  let currentLine = firstBodyLine;

  for (const block of blocks) {
    modules.set(block.module, { start: currentLine, end: currentLine + block.endOffset });
    for (const file of block.files) {
      files.set(file.path, {
        start: currentLine + file.startOffset,
        end: currentLine + file.endOffset,
      });
    }
    currentLine += block.lines.length;
  }

  return { modules, files };
}

function displayRoot(cwd: string, root: string): string {
  const relative = path.relative(cwd, root);
  return toPosix(relative || '.');
}

function validateRenderedRanges(lines: string[], blocks: ModuleBlock[], ranges: ResolvedRanges): void {
  for (const block of blocks) {
    const moduleRange = ranges.modules.get(block.module);
    if (!moduleRange || lines[moduleRange.start - 1] !== `## ${block.module}` || moduleRange.end > lines.length) {
      throw new Error(`Internal line map error for module: ${block.module}`);
    }
    for (const file of block.files) {
      const fileRange = ranges.files.get(file.path);
      if (!fileRange || lines[fileRange.start - 1] !== `### \`${file.path}\`` || fileRange.end > lines.length) {
        throw new Error(`Internal line map error for file: ${file.path}`);
      }
    }
  }
}

function renderDocument(name: string, cwd: string, roots: string[], files: ExtractedFile[]): string {
  const header = [
    `# Contract Context: ${name}`,
    '',
    `Target root${roots.length === 1 ? '' : 's'}: ${roots.map((root) => `\`${displayRoot(cwd, root)}\``).join(', ')}`,
    `Matched files: ${files.length}`,
    '',
    '> Navigation: read `## Content Map`, find relevant module or file, then retrieve only its mapped line range (`L#####-L#####`).',
    '',
  ];
  const blocks = buildModuleBlocks(files);
  // First pass reserves map lines. Second pass resolves exact final line addresses.
  const placeholderMap = renderMap(blocks);
  const separator = ['---', ''];
  const firstBodyLine = header.length + placeholderMap.length + separator.length + 1;
  const ranges = resolveRanges(blocks, firstBodyLine);
  const contentMap = renderMap(blocks, ranges);

  if (contentMap.length !== placeholderMap.length) {
    throw new Error('Internal line map error: rendered map length changed.');
  }

  const body = blocks.flatMap((block) => block.lines);
  const documentLines = [...header, ...contentMap, ...separator, ...body];
  validateRenderedRanges(documentLines, blocks, ranges);
  return documentLines.join('\n').trimEnd() + '\n';
}

function resolveName(cwd: string, roots: string[], config: ExtractorConfig): string {
  if (config.name) return config.name;
  const source = roots.length === 1 ? path.basename(roots[0]) : path.basename(cwd);
  return source || 'repository';
}

function slugify(value: string): string {
  const slug = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'repository';
}

function resolveOutput(cwd: string, name: string, config: ExtractorConfig): string {
  if (config.output) return path.resolve(cwd, config.output);
  return path.resolve(cwd, config.outputDir, `${slugify(name)}_contracts.md`);
}

async function writeAtomic(outputPath: string, content: string): Promise<void> {
  // Existing snapshot survives discovery, parsing, rendering, or write failures.
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, content, 'utf8');
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const cli = parseCli(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const config = await loadConfig(cwd, cli);
  const roots = await resolveRoots(cwd, config.roots);
  const matchedPaths = findFilesWithRipgrep(cwd, roots, config);
  if (matchedPaths.length === 0) {
    throw new Error('No files matched configured contract, port, or schema criteria. Existing output was not changed.');
  }

  const located = matchedPaths.map((filePath) => locateFile(cwd, filePath, roots));
  const warnings: string[] = [];
  const extracted = (await Promise.all(located.map((file) => extractFile(file, config, warnings))))
    .filter((file): file is ExtractedFile => file !== null)
    .sort(compareExtractedFiles);

  if (extracted.length === 0) {
    throw new Error('Matched files produced no readable text content. Existing output was not changed.');
  }

  const name = resolveName(cwd, roots, config);
  const outputPath = resolveOutput(cwd, name, config);
  const document = renderDocument(name, cwd, roots, extracted);
  await writeAtomic(outputPath, document);

  console.log(`Generated ${path.relative(cwd, outputPath)} from ${extracted.length} matched file(s).`);
  for (const warning of warnings) console.warn(`Warning: ${warning}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`extract-contracts: ${message}`);
  process.exitCode = 1;
});
