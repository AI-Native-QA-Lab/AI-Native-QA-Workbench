import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const blueprintMarkdownFiles = [
  ".github/ISSUE_TEMPLATE/feature.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/workflows/README.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "FILE_INDEX.md",
  "README.md",
  "README.zh-CN.md",
  "SECURITY.md",
  "docs/adr/README.md",
  "docs/development/GITHUB_MILESTONES_AND_EPICS.md",
  "docs/development/RELEASE_PLAN.md",
  "docs/development/iterations/POST_V1_PLAN.md",
  "docs/development/iterations/V1_0_IMPLEMENTATION_PLAN.md",
  "docs/development/migration/DSH_QA_MIGRATION_MATRIX.md",
  "docs/development/mvp/MVP_IMPLEMENTATION_PLAN.md",
  "docs/development/tdd/TDD_PLAN.md",
  "docs/en/MVP.md",
  "docs/en/PROJECT_BLUEPRINT.md",
  "docs/en/ROADMAP.md",
  "docs/en/TECH_STACK.md",
  "docs/en/contracts/CORE_CONTRACT_INDEX.md",
  "docs/zh-CN/MVP.md",
  "docs/zh-CN/PROJECT_BLUEPRINT.md",
  "docs/zh-CN/ROADMAP.md",
  "docs/zh-CN/TECH_STACK.md",
  "docs/zh-CN/contracts/CORE_CONTRACT_INDEX.md",
] as const;

const excludedDirectoryNames = new Set([".git", ".superpowers", "node_modules"]);

interface DocumentationLink {
  filePath: string;
  target: string;
}

async function collectMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) {
      continue;
    }

    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

function removeFencedCodeBlocks(source: string): string {
  let insideFence = false;
  const visibleLines: string[] = [];

  for (const line of source.split(/\r?\n/)) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (!insideFence) {
      visibleLines.push(line);
    }
  }

  return visibleLines.join("\n");
}

function findLinkTargets(source: string): string[] {
  const visibleSource = removeFencedCodeBlocks(source);
  const targets: string[] = [];
  const inlineLinkPattern = /!?\[[^\]]*\]\((<[^>]+>|[^)\n]+)\)/g;
  const referenceLinkPattern = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm;

  for (const match of visibleSource.matchAll(inlineLinkPattern)) {
    if (match[1] !== undefined) {
      targets.push(match[1]);
    }
  }
  for (const match of visibleSource.matchAll(referenceLinkPattern)) {
    if (match[1] !== undefined) {
      targets.push(match[1]);
    }
  }

  return targets;
}

function normalizeLinkTarget(rawTarget: string): string | undefined {
  const trimmedTarget = rawTarget.trim();
  const target =
    trimmedTarget.startsWith("<") && trimmedTarget.endsWith(">")
      ? trimmedTarget.slice(1, -1)
      : trimmedTarget.split(/\s+/, 1)[0];

  if (
    target === undefined ||
    target === "" ||
    target.startsWith("#") ||
    target.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(target) ||
    target.startsWith("//")
  ) {
    return undefined;
  }

  const withoutFragment = target.split(/[?#]/, 1)[0];
  if (withoutFragment === undefined || withoutFragment === "") {
    return undefined;
  }

  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

async function findBrokenLinks(markdownFiles: string[]): Promise<DocumentationLink[]> {
  const brokenLinks: DocumentationLink[] = [];

  for (const filePath of markdownFiles) {
    const source = await readFile(filePath, "utf8");
    for (const rawTarget of findLinkTargets(source)) {
      const target = normalizeLinkTarget(rawTarget);
      if (target === undefined) {
        continue;
      }

      const linkedPath = resolve(dirname(filePath), target);
      if (!existsSync(linkedPath)) {
        brokenLinks.push({ filePath, target: rawTarget });
      }
    }
  }

  return brokenLinks;
}

async function main(): Promise<void> {
  const failures: string[] = [];

  const licensePath = join(repositoryRoot, "LICENSE");
  if (!existsSync(licensePath)) {
    failures.push("缺少根目录 LICENSE");
  } else {
    const licenseFirstLine = (await readFile(licensePath, "utf8")).split(/\r?\n/, 1)[0];
    if (licenseFirstLine !== "# PolyForm Noncommercial License 1.0.0") {
      failures.push(`LICENSE 首行不匹配：${licenseFirstLine ?? ""}`);
    }
  }

  for (const relativePath of blueprintMarkdownFiles) {
    if (!existsSync(join(repositoryRoot, relativePath))) {
      failures.push(`缺少 Blueprint 文件：${relativePath}`);
    }
  }

  for (const readmePath of ["README.md", "README.zh-CN.md"]) {
    const absolutePath = join(repositoryRoot, readmePath);
    if (!existsSync(absolutePath)) {
      continue;
    }
    const source = await readFile(absolutePath, "utf8");
    if (!source.includes("qaw init") || !source.includes("qaw validate")) {
      failures.push(`${readmePath} 必须包含 qaw init 和 qaw validate 快速开始命令`);
    }
  }

  const markdownFiles = await collectMarkdownFiles(repositoryRoot);
  for (const brokenLink of await findBrokenLinks(markdownFiles)) {
    failures.push(
      `Markdown 链接不存在：${relative(repositoryRoot, brokenLink.filePath)} -> ${brokenLink.target}`,
    );
  }

  if (failures.length > 0) {
    console.error("文档检查失败：");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `文档检查通过：${blueprintMarkdownFiles.length} 个 Blueprint Markdown 文件，${markdownFiles.length} 个 Markdown 文件。`,
  );
}

await main();
