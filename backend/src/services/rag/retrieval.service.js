import { CodeChunk } from "../../models/codeChunk.model.js";
import { generateEmbedding, cosineSimilarity } from "./embedding.service.js";

/**
 * Classifies natural-language query intent into 7 human-centric categories,
 * with conversational context awareness for follow-up questions.
 */
export const classifyQueryIntent = (query = "", history = []) => {
    let q = (query || "").toLowerCase().trim();

    // Context resolution for follow-up questions
    if (Array.isArray(history) && history.length > 0 && (
        q.startsWith("now ") ||
        q.startsWith("what about") ||
        q.startsWith("how about") ||
        q.includes("in more detail") ||
        q.includes("tell me more") ||
        q.includes("explain further") ||
        q.includes("and it") ||
        q.includes("in it")
    )) {
        const lastUserMsg = [...history].reverse().find(
            (m) => m.role === "user" || m.sender === "user"
        );
        if (lastUserMsg) {
            const lastText = (lastUserMsg.content || lastUserMsg.text || "").toLowerCase();
            q = `${lastText} ${q}`;
        }
    }

    // A. Repository Overview ("What does this project do? Explain this project to me.")
    if (
        q.includes("what does this project do") ||
        q.includes("what does this repo do") ||
        q.includes("what problem does this") ||
        q.includes("overview of this") ||
        q.includes("explain this project") ||
        q.includes("explain this repo") ||
        q.includes("tell me about this project") ||
        q.includes("simple english") && (q.includes("project") || q.includes("repo")) ||
        q.includes("new to this project") ||
        q.includes("beginner") && q.includes("project")
    ) {
        return "repository_overview";
    }

    // B. Architecture Understanding
    if (
        q.includes("overall architecture") ||
        q.includes("complete architecture") ||
        q.includes("system architecture") ||
        q.includes("how is this project designed") ||
        q.includes("architecture pattern") ||
        q.includes("design pattern") ||
        q.includes("how components work together") ||
        (q.includes("architecture") && !q.includes("folder"))
    ) {
        return "architecture";
    }

    // C. Folder Structure Understanding
    if (
        q.includes("folder structure") ||
        q.includes("directory structure") ||
        q.includes("project structure") ||
        q.includes("purpose of each folder") ||
        q.includes("where is the main") ||
        q.includes("folder") ||
        q.includes("directory")
    ) {
        return "folder_structure";
    }

    // G. Problem-Solving & Debugging Questions
    if (
        q.includes("why is this failing") ||
        q.includes("why is this api failing") ||
        q.includes("why does this return an error") ||
        q.includes("why is authentication failing") ||
        q.includes("troubleshoot") ||
        q.includes("fix the bug") ||
        q.includes("bug in") ||
        q.includes("error in") ||
        q.includes("how to solve")
    ) {
        return "problem_solving";
    }

    // F. Dependency & Module Relationships
    if (
        q.includes("how are these modules connected") ||
        q.includes("which components depend on") ||
        q.includes("what happens if this function changes") ||
        q.includes("dependency") ||
        q.includes("dependencies") ||
        q.includes("packages") ||
        q.includes("third-party")
    ) {
        return "dependencies";
    }

    // D. Execution-Flow Understanding (Login flow, request lifecycle, frontend-backend communication)
    if (
        q.includes("flow") ||
        q.includes("execution") ||
        q.includes("communicate") ||
        q.includes("travel through") ||
        q.includes("what happens when") ||
        q.includes("step by step") ||
        q.includes("lifecycle") ||
        q.includes("how does a request") ||
        q.includes("login flow") ||
        q.includes("create a new project") ||
        q.includes("creates a new task")
    ) {
        return "execution_flow";
    }

    // Specialized intents for models and routes
    if (
        q.includes("database") ||
        q.includes("model") ||
        q.includes("models") ||
        q.includes("schema") ||
        q.includes("schemas") ||
        q.includes("entities") ||
        q.includes("entity") ||
        q.includes("collection") ||
        q.includes("mongoose")
    ) {
        return "database_models";
    }

    if (
        q.includes("route") ||
        q.includes("routes") ||
        q.includes("endpoint") ||
        q.includes("endpoints") ||
        q.includes("api") ||
        q.includes("controller")
    ) {
        return "api_routes";
    }

    if (
        q.includes("auth") ||
        q.includes("login") ||
        q.includes("jwt") ||
        q.includes("token") ||
        q.includes("register") ||
        q.includes("password")
    ) {
        return "authentication";
    }

    if (
        q.includes("function") ||
        q.includes("class") ||
        q.includes("method") ||
        q.includes("what does this") ||
        q.includes("explain this file")
    ) {
        return "component_explanation";
    }

    return "general_code";
};

/**
 * Extracts potential code symbols, function names, class names, or file paths from user query.
 */
export const extractKeywordsFromQuery = (query) => {
    if (!query || typeof query !== "string") return [];

    // Extract identifiers (camelCase, PascalCase, snake_case, words with dots or slashes)
    const tokens = new Set();
    const tokenRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$./\\-]*\b/g;
    let match;

    const stopWords = new Set([
        "explain", "what", "where", "how", "does", "the", "this", "that", "with",
        "from", "into", "when", "which", "who", "file", "code", "repo", "project",
        "show", "find", "tell", "work", "works", "used", "call", "calls", "called",
        "about", "have", "been", "using", "make", "many", "more", "most", "some"
    ]);

    while ((match = tokenRegex.exec(query)) !== null) {
        const word = match[0];
        const lower = word.toLowerCase();
        if (word.length >= 2 && !stopWords.has(lower) && !/^\d+$/.test(word)) {
            tokens.add(word);
            // Also add case-insensitive variant
            tokens.add(lower);
        }
    }

    return Array.from(tokens).slice(0, 15);
};

/**
 * A. Semantic Retrieval: Retrieves chunks with highest cosine similarity to the query embedding.
 */
export const performSemanticSearch = async (projectId, branch, queryEmbedding, topK = 15) => {
    // 1. Fetch chunks for the target project and branch
    const candidates = await CodeChunk.find({
        project: projectId,
        branch
    })
        .select(
            "filePath fileName language symbolName symbolType startLine endLine content contextHeader imports calls dependencies embedding"
        )
        .lean();

    if (!candidates || candidates.length === 0) {
        return [];
    }

    // 2. Score candidates by cosine similarity
    const scored = candidates
        .map((chunk) => {
            const similarity = chunk.embedding && chunk.embedding.length > 0
                ? cosineSimilarity(queryEmbedding, chunk.embedding)
                : 0;

            return {
                chunk,
                semanticScore: Math.max(0, similarity)
            };
        })
        .filter((item) => item.semanticScore > 0.02)
        .sort((a, b) => b.semanticScore - a.semanticScore)
        .slice(0, topK);

    return scored;
};

/**
 * B. Keyword Retrieval: Matches symbol names, file paths, calls, and intent context.
 */
export const performKeywordSearch = async (projectId, branch, keywords, topK = 15, intent = "general_code") => {
    const queryConditions = [];

    if (keywords && keywords.length > 0) {
        const regexArray = keywords.map((kw) => new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
        queryConditions.push(
            { symbolName: { $in: regexArray } },
            { filePath: { $in: regexArray } },
            { calls: { $in: regexArray } },
            { imports: { $in: regexArray } }
        );
    }

    // Augment query conditions based on query intent
    if (intent === "database_models") {
        queryConditions.push(
            { filePath: /models?|schemas?|entities?/i },
            { symbolType: "model" },
            { content: /mongoose\.model|Schema\(|entity|table/i }
        );
    } else if (intent === "api_routes") {
        queryConditions.push(
            { filePath: /routes?|controllers?|api/i },
            { symbolType: "route" },
            { content: /Router\(|\.get\(|\.post\(|\.put\(|\.delete\(/i }
        );
    } else if (intent === "authentication") {
        queryConditions.push(
            { filePath: /auth|login|jwt|token/i },
            { symbolName: /auth|login|jwt|token|verify|password/i },
            { content: /jwt|bcrypt|bearer|passport|authenticate/i }
        );
    } else if (intent === "architecture") {
        queryConditions.push(
            { filePath: /app\.|server\.|index\.|main\.|routes?\./i },
            { symbolType: { $in: ["route", "controller", "model"] } }
        );
    }

    if (queryConditions.length === 0) return [];

    const candidates = await CodeChunk.find({
        project: projectId,
        branch,
        $or: queryConditions
    })
        .select(
            "filePath fileName language symbolName symbolType startLine endLine content contextHeader imports calls dependencies"
        )
        .limit(topK * 4)
        .lean();

    const scored = candidates.map((chunk) => {
        let score = 0;
        const symLower = (chunk.symbolName || "").toLowerCase();
        const pathLower = (chunk.filePath || "").toLowerCase();
        const callsArray = (chunk.calls || []).map((c) => c.toLowerCase());

        // Intent matches get high base weight
        if (intent === "database_models" && (pathLower.includes("model") || pathLower.includes("schema") || chunk.symbolType === "model")) {
            score += 0.75;
        }
        if (intent === "api_routes" && (pathLower.includes("route") || pathLower.includes("controller") || chunk.symbolType === "route")) {
            score += 0.75;
        }
        if (intent === "authentication" && (pathLower.includes("auth") || symLower.includes("auth") || symLower.includes("login"))) {
            score += 0.85;
        }
        if (intent === "architecture" && (pathLower.includes("app.") || pathLower.includes("server.") || pathLower.includes("index."))) {
            score += 0.8;
        }

        for (const kw of keywords) {
            const kwLower = kw.toLowerCase();
            // Exact symbol match is highest value
            if (symLower === kwLower) {
                score += 1.0;
            } else if (symLower.includes(kwLower)) {
                score += 0.6;
            }

            // File path match
            if (pathLower.endsWith(kwLower) || pathLower.includes(`/${kwLower}`)) {
                score += 0.8;
            } else if (pathLower.includes(kwLower)) {
                score += 0.4;
            }

            // Direct call site match
            if (callsArray.includes(kwLower)) {
                score += 0.5;
            }
        }

        return {
            chunk,
            keywordScore: Math.min(1.0, score)
        };
    });

    return scored
        .filter((item) => item.keywordScore > 0.05)
        .sort((a, b) => b.keywordScore - a.keywordScore)
        .slice(0, topK);
};

/**
 * C. Dependency-Graph Context Retrieval:
 * Extracts definitions of functions called by top chunks and callers of top symbols.
 */
export const performDependencyGraphSearch = async (projectId, branch, primaryChunks, topK = 8) => {
    if (!primaryChunks || primaryChunks.length === 0) return [];

    const callsToFind = new Set();
    const symbolsToFind = new Set();
    const existingChunkIds = new Set(primaryChunks.map((c) => c._id.toString()));

    for (const chunk of primaryChunks) {
        if (chunk.symbolName) symbolsToFind.add(chunk.symbolName);
        if (Array.isArray(chunk.calls)) {
            for (const callName of chunk.calls) {
                if (callName.length > 2) callsToFind.add(callName);
            }
        }
    }

    if (callsToFind.size === 0 && symbolsToFind.size === 0) {
        return [];
    }

    // Find code definitions that provide the called functions or call the symbols
    const relatedChunks = await CodeChunk.find({
        project: projectId,
        branch,
        _id: { $nin: Array.from(existingChunkIds) },
        $or: [
            { symbolName: { $in: Array.from(callsToFind) } },
            { calls: { $in: Array.from(symbolsToFind) } }
        ]
    })
        .select(
            "filePath fileName language symbolName symbolType startLine endLine content contextHeader imports calls dependencies"
        )
        .limit(topK)
        .lean();

    return relatedChunks.map((chunk) => {
        let graphScore = 0.5;
        // Higher score if it directly defines a function called by our primary chunk
        if (callsToFind.has(chunk.symbolName)) {
            graphScore = 0.8;
        }

        return {
            chunk,
            graphScore,
            isDependencyContext: true
        };
    });
};

/**
 * Hybrid Retrieval Orchestrator:
 * Executes Semantic, Keyword, and Graph retrieval, performs Reciprocal Rank Fusion,
 * and returns prioritized, deduplicated evidence chunks.
 */
export const performHybridRetrieval = async (projectId, branch, query, options = {}) => {
    const { topK = 10 } = options;

    // 1. Identify query intent & extract keywords
    const intent = classifyQueryIntent(query);
    const keywords = extractKeywordsFromQuery(query);

    // 2. Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // 3. Execute Semantic and Keyword searches in parallel
    const [semanticResults, keywordResults] = await Promise.all([
        performSemanticSearch(projectId, branch, queryEmbedding, 15),
        performKeywordSearch(projectId, branch, keywords, 15, intent)
    ]);

    // 4. Identify initial top candidates for Dependency Graph exploration
    const initialTopChunks = [];
    const chunkMap = new Map();

    // Map semantic results
    for (const item of semanticResults) {
        const id = item.chunk._id.toString();
        chunkMap.set(id, {
            chunk: item.chunk,
            semanticScore: item.semanticScore,
            keywordScore: 0,
            graphScore: 0
        });
        initialTopChunks.push(item.chunk);
    }

    // Map keyword results
    for (const item of keywordResults) {
        const id = item.chunk._id.toString();
        if (chunkMap.has(id)) {
            chunkMap.get(id).keywordScore = item.keywordScore;
        } else {
            chunkMap.set(id, {
                chunk: item.chunk,
                semanticScore: 0,
                keywordScore: item.keywordScore,
                graphScore: 0
            });
            initialTopChunks.push(item.chunk);
        }
    }

    // 5. Execute Dependency Graph Search on discovered candidates
    const graphResults = await performDependencyGraphSearch(
        projectId,
        branch,
        initialTopChunks.slice(0, 6),
        6
    );

    for (const item of graphResults) {
        const id = item.chunk._id.toString();
        if (chunkMap.has(id)) {
            chunkMap.get(id).graphScore = item.graphScore;
            chunkMap.get(id).isDependencyContext = true;
        } else {
            chunkMap.set(id, {
                chunk: item.chunk,
                semanticScore: 0,
                keywordScore: 0,
                graphScore: item.graphScore,
                isDependencyContext: true
            });
        }
    }

    // If chunkMap has fewer than 3 items and intent is architecture or general,
    // fetch representative chunks from entry points, routes, or models
    if (chunkMap.size < 3) {
        const fallbackChunks = await CodeChunk.find({
            project: projectId,
            branch
        })
            .limit(8)
            .lean();

        for (const fb of fallbackChunks) {
            const id = fb._id.toString();
            if (!chunkMap.has(id)) {
                chunkMap.set(id, {
                    chunk: fb,
                    semanticScore: 0.2,
                    keywordScore: 0.2,
                    graphScore: 0,
                    isDependencyContext: false
                });
            }
        }
    }

    // 6. Compute fused hybrid score
    const fusedList = [];
    for (const entry of chunkMap.values()) {
        const { chunk, semanticScore, keywordScore, graphScore, isDependencyContext } = entry;

        // Base hybrid weighting: 45% Semantic, 35% Keyword, 20% Graph
        let combinedScore =
            0.45 * semanticScore + 0.35 * keywordScore + 0.20 * graphScore;

        // Boost exact symbol matches
        const sym = (chunk.symbolName || "").toLowerCase();
        for (const kw of keywords) {
            if (sym === kw.toLowerCase() && sym.length > 2) {
                combinedScore *= 1.35;
                break;
            }
        }

        fusedList.push({
            chunk,
            score: parseFloat(combinedScore.toFixed(4)),
            semanticScore: parseFloat(semanticScore.toFixed(4)),
            keywordScore: parseFloat(keywordScore.toFixed(4)),
            graphScore: parseFloat(graphScore.toFixed(4)),
            isDependencyContext: !!isDependencyContext,
            intent
        });
    }

    // 7. Deduplicate overlapping chunks from the same file & line ranges
    fusedList.sort((a, b) => b.score - a.score);

    const deduplicated = [];
    const seenRanges = new Set();

    for (const item of fusedList) {
        const c = item.chunk;
        const key = `${c.filePath}:${c.startLine}:${c.endLine}`;
        if (!seenRanges.has(key)) {
            seenRanges.add(key);
            deduplicated.push(item);
        }
        if (deduplicated.length >= topK) break;
    }

    return deduplicated;
};
