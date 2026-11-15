import crypto from "crypto";
import path from "path";

// Dynamically load Babel parser if available
let babelParser = null;
try {
    const babelModule = await import(
        "../../../backend/node_modules/@babel/parser/lib/index.js"
    ).catch(() => import("@babel/parser"));
    babelParser = babelModule?.default || babelModule;
} catch {
    babelParser = null;
}

/**
 * Computes SHA-256 hash of a string.
 */
export const computeContentHash = (text) => {
    return crypto.createHash("sha256").update(text || "").digest("hex");
};

/**
 * Identifies language from file extension.
 */
export const getLanguageFromExtension = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        ".js": "javascript",
        ".mjs": "javascript",
        ".cjs": "javascript",
        ".jsx": "jsx",
        ".ts": "typescript",
        ".mts": "typescript",
        ".cts": "typescript",
        ".tsx": "tsx",
        ".json": "json",
        ".py": "python",
        ".java": "java",
        ".go": "go",
        ".rb": "ruby",
        ".rs": "rust",
        ".cpp": "cpp",
        ".cc": "cpp",
        ".c": "c",
        ".h": "c",
        ".hpp": "cpp",
        ".cs": "csharp",
        ".php": "php",
        ".sh": "bash",
        ".bash": "bash",
        ".sql": "sql",
        ".md": "markdown",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".html": "html",
        ".css": "css"
    };
    return map[ext] || "text";
};

/**
 * Determines whether a repository file should be indexed.
 * Filters out dependencies, build artifacts, binaries, lockfiles, and secrets.
 */
export const shouldProcessFile = (filePath, size = 0) => {
    if (!filePath || typeof filePath !== "string") return false;

    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    const fileName = path.basename(normalized);

    // 1. Skip files larger than 500 KB to avoid rate-limits and token bloat
    if (size > 500 * 1024) return false;

    // 2. Directory exclusions
    const excludedDirs = [
        "node_modules/",
        ".git/",
        "dist/",
        "build/",
        "out/",
        "coverage/",
        "vendor/",
        ".next/",
        ".nuxt/",
        ".output/",
        ".cache/",
        "__pycache__/",
        ".pytest_cache/",
        ".venv/",
        "venv/",
        "env/",
        "bin/",
        "obj/",
        "target/",
        "logs/"
    ];
    if (excludedDirs.some((dir) => normalized.includes(dir) || normalized.startsWith(dir))) {
        return false;
    }

    // 3. Binary & Media extensions
    const binaryExtensions = [
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
        ".mp4", ".mp3", ".wav", ".avi", ".mov",
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
        ".zip", ".tar", ".gz", ".7z", ".rar",
        ".exe", ".dll", ".so", ".dylib", ".bin", ".iso",
        ".woff", ".woff2", ".ttf", ".eot", ".otf",
        ".jar", ".war", ".class", ".pyc", ".pyo"
    ];
    if (binaryExtensions.some((ext) => normalized.endsWith(ext))) {
        return false;
    }

    // 4. Minified and bundled files
    if (normalized.endsWith(".min.js") || normalized.endsWith(".min.css") || normalized.endsWith(".bundle.js")) {
        return false;
    }

    // 5. Dependency lockfiles
    const lockfiles = [
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "composer.lock",
        "cargo.lock",
        "gemfile.lock",
        "poetry.lock"
    ];
    if (lockfiles.includes(fileName)) {
        return false;
    }

    // 6. Sensitive / secret files (never index private keys or credentials)
    if (
        fileName === ".env" ||
        fileName.startsWith(".env.") ||
        fileName.endsWith(".pem") ||
        fileName.endsWith(".key") ||
        fileName.endsWith(".crt") ||
        fileName.includes("id_rsa") ||
        fileName === "credentials.json" ||
        fileName === "secrets.json"
    ) {
        return false;
    }

    // 7. Check if file is one of supported code/config types
    const supportedExtensions = [
        ".js", ".jsx", ".ts", ".tsx",
        ".json",
        ".py",
        ".java",
        ".go", ".rb", ".rs", ".cpp", ".c", ".h", ".cs", ".php",
        ".md", ".yaml", ".yml", ".sql"
    ];
    return supportedExtensions.some((ext) => normalized.endsWith(ext));
};

export const isIndexableFile = shouldProcessFile;
export const detectLanguage = getLanguageFromExtension;

/**
 * Extracts function call names and identifier usages using regex.
 */
const extractCallsFromCode = (code) => {
    const calls = new Set();
    const callPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let match;
    const reservedWords = new Set([
        "if", "for", "while", "switch", "catch", "return", "function", "class",
        "super", "import", "export", "require", "typeof", "instanceof", "new", "delete"
    ]);

    while ((match = callPattern.exec(code)) !== null) {
        const fn = match[1];
        if (!reservedWords.has(fn) && fn.length > 1) {
            calls.add(fn);
        }
    }
    return Array.from(calls).slice(0, 30);
};

/**
 * Extracts import paths and symbols from code.
 */
const extractImportsFromCode = (code) => {
    const imports = new Set();
    const esmPattern = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
    const cjsPattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const pyPattern = /(?:from\s+([a-zA-Z0-9_.]+)\s+import|import\s+([a-zA-Z0-9_.]+))/g;

    let match;
    while ((match = esmPattern.exec(code)) !== null) {
        if (match[1]) imports.add(match[1]);
    }
    while ((match = cjsPattern.exec(code)) !== null) {
        if (match[1]) imports.add(match[1]);
    }
    while ((match = pyPattern.exec(code)) !== null) {
        const pkg = match[1] || match[2];
        if (pkg) imports.add(pkg);
    }
    return Array.from(imports).slice(0, 20);
};

/**
 * AST-based code-aware chunker for JavaScript, TypeScript, JSX, and TSX.
 */
const parseJsTsWithAst = (filePath, content, language) => {
    if (!babelParser || !babelParser.parse) {
        return null;
    }

    try {
        const ast = babelParser.parse(content, {
            sourceType: "module",
            plugins: [
                "typescript",
                "jsx",
                "classProperties",
                "decorators-legacy",
                "asyncGenerators",
                "dynamicImport",
                "exportDefaultFrom",
                "objectRestSpread"
            ],
            errorRecovery: true
        });

        const lines = content.split("\n");
        const chunks = [];
        const fileImports = new Set();

        // 1. Collect top-level imports first to establish dependency context
        for (const node of ast.program.body) {
            if (node.type === "ImportDeclaration" && node.source?.value) {
                fileImports.add(node.source.value);
            }
        }
        const fileImportsArray = Array.from(fileImports);

        // 2. Extract meaningful AST constructs
        for (const node of ast.program.body) {
            let targetNode = node;
            let isExport = false;

            if (node.type === "ExportNamedDeclaration" && node.declaration) {
                targetNode = node.declaration;
                isExport = true;
            } else if (node.type === "ExportDefaultDeclaration" && node.declaration) {
                targetNode = node.declaration;
                isExport = true;
            }

            const startLine = node.loc?.start?.line || 1;
            const endLine = node.loc?.end?.line || lines.length;
            const chunkContent = lines.slice(startLine - 1, endLine).join("\n").trim();

            if (!chunkContent) continue;

            const calls = extractCallsFromCode(chunkContent);

            // A. Function Declarations
            if (
                targetNode.type === "FunctionDeclaration" ||
                (targetNode.type === "VariableDeclaration" &&
                    targetNode.declarations?.[0]?.init?.type === "ArrowFunctionExpression")
            ) {
                const name =
                    targetNode.id?.name ||
                    targetNode.declarations?.[0]?.id?.name ||
                    "anonymousFunction";

                // Check if it's a React component (starts with uppercase)
                const isComponent = /^[A-Z]/.test(name) && (chunkContent.includes("<") || chunkContent.includes("return"));

                chunks.push({
                    symbolName: name,
                    symbolType: isComponent ? "component" : "function",
                    startLine,
                    endLine,
                    content: chunkContent,
                    contextHeader: `${isExport ? "Exported " : ""}${isComponent ? "React Component" : "Function"}: ${name}`,
                    imports: fileImportsArray,
                    calls,
                    dependencies: fileImportsArray
                });
            }
            // B. Class Declarations
            else if (targetNode.type === "ClassDeclaration") {
                const className = targetNode.id?.name || "AnonymousClass";

                // For large classes, split methods individually while preserving class header
                const classBody = targetNode.body?.body || [];
                if (classBody.length > 2 && endLine - startLine > 40) {
                    // Method level chunking
                    for (const member of classBody) {
                        if (member.type === "ClassMethod" && member.loc) {
                            const mStart = member.loc.start.line;
                            const mEnd = member.loc.end.line;
                            const mName = member.key?.name || "method";
                            const mContent = lines.slice(mStart - 1, mEnd).join("\n").trim();

                            chunks.push({
                                symbolName: `${className}.${mName}`,
                                symbolType: "method",
                                startLine: mStart,
                                endLine: mEnd,
                                content: mContent,
                                contextHeader: `Class ${className} -> Method ${mName}`,
                                imports: fileImportsArray,
                                calls: extractCallsFromCode(mContent),
                                dependencies: fileImportsArray
                            });
                        }
                    }
                } else {
                    // Compact class chunk
                    chunks.push({
                        symbolName: className,
                        symbolType: "class",
                        startLine,
                        endLine,
                        content: chunkContent,
                        contextHeader: `${isExport ? "Exported " : ""}Class: ${className}`,
                        imports: fileImportsArray,
                        calls,
                        dependencies: fileImportsArray
                    });
                }
            }
            // C. TypeScript Interfaces & Type Aliases
            else if (targetNode.type === "TSInterfaceDeclaration") {
                const name = targetNode.id?.name || "Interface";
                chunks.push({
                    symbolName: name,
                    symbolType: "interface",
                    startLine,
                    endLine,
                    content: chunkContent,
                    contextHeader: `${isExport ? "Exported " : ""}Interface: ${name}`,
                    imports: fileImportsArray,
                    calls: [],
                    dependencies: fileImportsArray
                });
            } else if (targetNode.type === "TSTypeAliasDeclaration") {
                const name = targetNode.id?.name || "TypeAlias";
                chunks.push({
                    symbolName: name,
                    symbolType: "type",
                    startLine,
                    endLine,
                    content: chunkContent,
                    contextHeader: `${isExport ? "Exported " : ""}Type: ${name}`,
                    imports: fileImportsArray,
                    calls: [],
                    dependencies: fileImportsArray
                });
            }
            // D. Route & Middleware & Model definitions
            else if (
                chunkContent.includes("router.") ||
                chunkContent.includes("app.get") ||
                chunkContent.includes("app.post") ||
                chunkContent.includes("app.use") ||
                chunkContent.includes("mongoose.model") ||
                chunkContent.includes("new Schema")
            ) {
                let symType = "route";
                let symName = "routeDefinition";
                if (chunkContent.includes("Schema") || chunkContent.includes("model(")) {
                    symType = "model";
                    const modelMatch = chunkContent.match(/model\(\s*["']([^"']+)["']/);
                    symName = modelMatch ? modelMatch[1] : "dbModel";
                }

                chunks.push({
                    symbolName: symName,
                    symbolType: symType,
                    startLine,
                    endLine,
                    content: chunkContent,
                    contextHeader: `${symType.toUpperCase()}: ${symName}`,
                    imports: fileImportsArray,
                    calls,
                    dependencies: fileImportsArray
                });
            }
        }

        return chunks.length > 0 ? chunks : null;
    } catch {
        return null;
    }
};

/**
 * Structural code chunker for Python files (.py).
 */
const parsePythonStructural = (content) => {
    const lines = content.split("\n");
    const chunks = [];
    const imports = extractImportsFromCode(content);

    let currentSymbol = null;
    let currentStart = 1;
    let currentLines = [];
    let currentType = "block";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Detect Python function or class definition
        const isClass = /^class\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(trimmed);
        const isDef = /^def\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(trimmed);
        const isDecorator = /^@\w+/.test(trimmed);

        if (isClass || isDef) {
            // Save previous block if exists
            if (currentLines.length > 0 && currentSymbol) {
                const blockContent = currentLines.join("\n").trim();
                chunks.push({
                    symbolName: currentSymbol,
                    symbolType: currentType,
                    startLine: currentStart,
                    endLine: i,
                    content: blockContent,
                    contextHeader: `Python ${currentType}: ${currentSymbol}`,
                    imports,
                    calls: extractCallsFromCode(blockContent),
                    dependencies: imports
                });
            }

            currentStart = isDecorator && i > 0 ? i : i + 1;
            currentSymbol = isClass ? isClass[1] : isDef[1];
            currentType = isClass ? "class" : "function";
            currentLines = [line];
        } else {
            currentLines.push(line);
        }
    }

    if (currentLines.length > 0 && currentSymbol) {
        const blockContent = currentLines.join("\n").trim();
        chunks.push({
            symbolName: currentSymbol,
            symbolType: currentType,
            startLine: currentStart,
            endLine: lines.length,
            content: blockContent,
            contextHeader: `Python ${currentType}: ${currentSymbol}`,
            imports,
            calls: extractCallsFromCode(blockContent),
            dependencies: imports
        });
    }

    return chunks.length > 0 ? chunks : null;
};

/**
 * Structural code chunker for Java files (.java).
 */
const parseJavaStructural = (content) => {
    const lines = content.split("\n");
    const chunks = [];
    const imports = extractImportsFromCode(content);

    let currentSymbol = null;
    let currentStart = 1;
    let currentLines = [];
    let currentType = "class";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        const isClass = /(?:public\s+|protected\s+|private\s+)?(?:class|interface|enum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(trimmed);
        const isMethod = /(?:public|protected|private|static|\s)+[\w<>\[\]]+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{?$/.exec(trimmed);

        if (isClass || isMethod) {
            if (currentLines.length > 0 && currentSymbol) {
                const blockContent = currentLines.join("\n").trim();
                chunks.push({
                    symbolName: currentSymbol,
                    symbolType: currentType,
                    startLine: currentStart,
                    endLine: i,
                    content: blockContent,
                    contextHeader: `Java ${currentType}: ${currentSymbol}`,
                    imports,
                    calls: extractCallsFromCode(blockContent),
                    dependencies: imports
                });
            }

            currentStart = i + 1;
            currentSymbol = isClass ? isClass[1] : isMethod[1];
            currentType = isClass ? "class" : "method";
            currentLines = [line];
        } else {
            currentLines.push(line);
        }
    }

    if (currentLines.length > 0 && currentSymbol) {
        const blockContent = currentLines.join("\n").trim();
        chunks.push({
            symbolName: currentSymbol,
            symbolType: currentType,
            startLine: currentStart,
            endLine: lines.length,
            content: blockContent,
            contextHeader: `Java ${currentType}: ${currentSymbol}`,
            imports,
            calls: extractCallsFromCode(blockContent),
            dependencies: imports
        });
    }

    return chunks.length > 0 ? chunks : null;
};

/**
 * Fallback sliding-window chunker for files where AST fails or unsupported languages.
 * Groups by logical blocks (30-50 lines) with a 5-line overlap to preserve context.
 */
export const slidingWindowChunker = (content, maxLines = 45, overlap = 5) => {
    const lines = content.split("\n");
    const chunks = [];
    const imports = extractImportsFromCode(content);

    if (lines.length <= maxLines) {
        const fullContent = content.trim();
        if (fullContent.length > 0) {
            chunks.push({
                symbolName: "fileRoot",
                symbolType: "file",
                startLine: 1,
                endLine: lines.length,
                content: fullContent,
                contextHeader: `File segment (Lines 1-${lines.length})`,
                imports,
                calls: extractCallsFromCode(fullContent),
                dependencies: imports
            });
        }
        return chunks;
    }

    let start = 0;
    while (start < lines.length) {
        let end = Math.min(start + maxLines, lines.length);

        // Try to break on an empty line if possible
        if (end < lines.length) {
            for (let b = end; b > end - 10 && b > start; b--) {
                if (lines[b].trim() === "") {
                    end = b;
                    break;
                }
            }
        }

        const chunkSlice = lines.slice(start, end).join("\n").trim();
        if (chunkSlice.length > 0) {
            chunks.push({
                symbolName: `block_${start + 1}_${end}`,
                symbolType: "block",
                startLine: start + 1,
                endLine: end,
                content: chunkSlice,
                contextHeader: `Code block (Lines ${start + 1}-${end})`,
                imports,
                calls: extractCallsFromCode(chunkSlice),
                dependencies: imports
            });
        }

        if (end >= lines.length) break;
        start = end - overlap;
        if (start <= 0 || start >= lines.length) break;
    }

    return chunks;
};

/**
 * Main chunking entry point.
 * Given a file path and raw text content, produces code-aware AST chunks.
 */
export const parseAndChunkFile = (filePath, content) => {
    if (!content || typeof content !== "string" || content.trim().length === 0) {
        return [];
    }

    const language = getLanguageFromExtension(filePath);
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(filePath);

    let rawChunks = null;

    // 1. Try AST parsing for JS/TS/JSX/TSX
    if (["javascript", "typescript", "jsx", "tsx"].includes(language)) {
        rawChunks = parseJsTsWithAst(filePath, content, language);
    }
    // 2. Python structural parsing
    else if (language === "python") {
        rawChunks = parsePythonStructural(content);
    }
    // 3. Java structural parsing
    else if (language === "java") {
        rawChunks = parseJavaStructural(content);
    }

    // 4. Fallback to resilient sliding-window chunker if language unsupported or AST threw
    if (!rawChunks || rawChunks.length === 0) {
        rawChunks = slidingWindowChunker(content);
    }

    // Enrich chunks with metadata and content hash
    return rawChunks.map((chunk) => {
        const contentHash = computeContentHash(chunk.content);
        // Estimate token count (~4 characters per token)
        const tokenCount = Math.ceil(chunk.content.length / 4);

        return {
            filePath,
            fileName,
            fileExtension,
            language,
            symbolName: chunk.symbolName || "codeBlock",
            symbolType: chunk.symbolType || "block",
            startLine: chunk.startLine || 1,
            endLine: chunk.endLine || 1,
            content: chunk.content,
            contextHeader: chunk.contextHeader || `File: ${filePath} (L${chunk.startLine}-L${chunk.endLine})`,
            contentHash,
            imports: chunk.imports || [],
            calls: chunk.calls || [],
            dependencies: chunk.dependencies || [],
            tokenCount
        };
    });
};

export const parseCodeToChunks = parseAndChunkFile;

/**
 * Analyzes repository tree and constructs a rich architectural manifest.
 * Used for high-level repository queries (architecture, folder hierarchy, database models, etc.)
 */
export const buildRepositoryManifest = (filePaths, repoInfo = {}, packageContents = {}) => {
    const rootFolders = new Set();
    const entryPoints = [];
    const models = [];
    const routes = [];
    const controllers = [];
    const services = [];
    const middlewares = [];
    const components = [];
    const hooks = [];
    const configs = [];
    const languageCounts = {};

    for (const filePath of filePaths) {
        const parts = filePath.split("/");
        if (parts.length > 1) {
            rootFolders.add(parts[0]);
        }

        const lower = filePath.toLowerCase();
        const fileName = parts[parts.length - 1];

        // Language tracking
        const lang = getLanguageFromExtension(filePath);
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;

        // Entry points
        if (
            fileName === "index.js" ||
            fileName === "app.js" ||
            fileName === "server.js" ||
            fileName === "main.js" ||
            fileName === "main.py" ||
            fileName === "main.jsx" ||
            fileName === "main.tsx" ||
            fileName === "App.jsx" ||
            fileName === "App.tsx"
        ) {
            entryPoints.push(filePath);
        }

        // Database models, schemas, entities
        if (
            lower.includes("/models/") ||
            lower.includes("/model/") ||
            lower.includes("/schemas/") ||
            lower.includes("/schema/") ||
            lower.includes("/entities/") ||
            lower.includes(".model.") ||
            lower.includes(".schema.") ||
            lower.endsWith("schema.prisma")
        ) {
            models.push(filePath);
        }

        // Routes and API endpoints
        if (
            lower.includes("/routes/") ||
            lower.includes("/route/") ||
            lower.includes("/api/") ||
            lower.includes(".routes.") ||
            lower.includes(".route.")
        ) {
            routes.push(filePath);
        }

        // Controllers
        if (
            lower.includes("/controllers/") ||
            lower.includes("/controller/") ||
            lower.includes(".controller.")
        ) {
            controllers.push(filePath);
        }

        // Services
        if (
            lower.includes("/services/") ||
            lower.includes("/service/") ||
            lower.includes(".service.")
        ) {
            services.push(filePath);
        }

        // Middlewares
        if (
            lower.includes("/middlewares/") ||
            lower.includes("/middleware/") ||
            lower.includes(".middleware.")
        ) {
            middlewares.push(filePath);
        }

        // React components / views
        if (
            lower.includes("/components/") ||
            lower.includes("/views/") ||
            lower.includes("/pages/")
        ) {
            components.push(filePath);
        }

        // Hooks
        if (lower.includes("/hooks/") || (fileName.startsWith("use") && (fileName.endsWith(".js") || fileName.endsWith(".ts")))) {
            hooks.push(filePath);
        }

        // Config files
        if (
            fileName.endsWith(".json") ||
            fileName.endsWith(".yaml") ||
            fileName.endsWith(".yml") ||
            fileName.includes("config") ||
            fileName.includes(".env.example")
        ) {
            configs.push(filePath);
        }
    }

    // Detect architecture boundaries
    const hasBackend = Array.from(rootFolders).some((f) =>
        ["backend", "server", "api"].includes(f.toLowerCase())
    );
    const hasFrontend = Array.from(rootFolders).some((f) =>
        ["frontend", "client", "web", "ui"].includes(f.toLowerCase())
    );

    let architectureType = "Modular Application";
    if (hasBackend && hasFrontend) {
        architectureType = "Full-Stack Monorepo (Node.js/Express Backend + React/Vite Frontend)";
    } else if (hasBackend) {
        architectureType = "Backend Service / API";
    } else if (hasFrontend) {
        architectureType = "Frontend Client Application";
    }

    return {
        repository: repoInfo.name || "RepoGuardian",
        owner: repoInfo.owner || "",
        branch: repoInfo.branch || "main",
        commitSha: repoInfo.commitSha || "",
        totalFiles: filePaths.length,
        rootFolders: Array.from(rootFolders),
        architectureType,
        entryPoints,
        models,
        routes,
        controllers,
        services,
        middlewares,
        components,
        configs: configs.slice(0, 25),
        languages: languageCounts,
        packages: packageContents
    };
};
