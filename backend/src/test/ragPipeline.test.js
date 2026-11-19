import assert from "assert";
import {
  isIndexableFile,
  detectLanguage,
  parseCodeToChunks,
  buildRepositoryManifest,
} from "../services/rag/codeParser.service.js";
import {
  generateEmbedding,
  generateEmbeddingsBatch,
  cosineSimilarity,
  EMBEDDING_DIMENSION,
} from "../services/rag/embedding.service.js";
import {
  extractKeywordsFromQuery,
  classifyQueryIntent,
} from "../services/rag/retrieval.service.js";
import {
  generateRepositoryAnswer,
  assembleContextPrompt,
} from "../services/rag/llm.service.js";

async function runTests() {
  console.log("=== Running RepoGuardian RAG Pipeline Automated Tests ===\n");

  // TEST 1: File Filtering
  console.log("[1/5] Testing File Filter & Language Detection...");
  assert.strictEqual(isIndexableFile("node_modules/package/index.js"), false, "node_modules should be ignored");
  assert.strictEqual(isIndexableFile(".git/config"), false, ".git should be ignored");
  assert.strictEqual(isIndexableFile(".env"), false, ".env should be ignored");
  assert.strictEqual(isIndexableFile("backend/.env.production"), false, ".env files should be ignored");
  assert.strictEqual(isIndexableFile("certs/server.pem"), false, "Secret keys should be ignored");
  assert.strictEqual(isIndexableFile("package-lock.json"), false, "Lockfiles should be ignored");
  assert.strictEqual(isIndexableFile("assets/logo.png"), false, "Binary images should be ignored");
  assert.strictEqual(isIndexableFile("src/services/auth.service.ts"), true, "TypeScript files should be accepted");
  assert.strictEqual(isIndexableFile("server.py"), true, "Python files should be accepted");
  assert.strictEqual(isIndexableFile("README.md"), true, "Markdown files should be accepted");

  assert.strictEqual(detectLanguage("src/app.ts"), "typescript");
  assert.strictEqual(detectLanguage("src/App.jsx"), "jsx");
  assert.strictEqual(detectLanguage("src/index.js"), "javascript");
  assert.strictEqual(detectLanguage("main.py"), "python");
  assert.strictEqual(detectLanguage("App.java"), "java");

  const keywords = extractKeywordsFromQuery("Where is authenticateUser called in authController.ts?");
  assert(keywords.includes("authenticateUser"), "Keyword extraction should find function symbol");
  assert(keywords.includes("authController.ts"), "Keyword extraction should find file path token");
  console.log("✓ File filtering, language detection & keyword extraction passed.");

  // TEST 2: Code-Aware AST Chunking (TypeScript / JavaScript)
  console.log("\n[2/5] Testing AST Chunking on TypeScript/JavaScript...");
  const tsSource = `
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { findUserById, updateUserStatus } from "../services/user.service.js";

export interface UserSession {
  userId: string;
  role: string;
}

export class AuthenticationManager {
  private secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  public verifyToken(token: string): boolean {
    return token.length > 10;
  }
}

export async function handleLogin(req: any, res: any) {
  const { username, password } = req.body;
  const user = await findUserById(username);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const status = await updateUserStatus(user.id, "active");
  return res.json({ success: true, user, status });
}
`;

  const tsChunks = parseCodeToChunks("src/auth/authManager.ts", tsSource);
  assert(tsChunks.length >= 3, `Expected at least 3 chunks, got ${tsChunks.length}`);

  // Find class chunk
  const classChunk = tsChunks.find((c) => c.symbolName === "AuthenticationManager");
  assert(classChunk, "AuthenticationManager class chunk should be extracted");
  assert.strictEqual(classChunk.symbolType, "class");
  assert(classChunk.startLine > 0 && classChunk.endLine >= classChunk.startLine);

  // Find function chunk
  const funcChunk = tsChunks.find((c) => c.symbolName === "handleLogin");
  assert(funcChunk, "handleLogin function chunk should be extracted");
  assert.strictEqual(funcChunk.symbolType, "function");
  assert(funcChunk.calls.includes("findUserById"), "handleLogin should record call to findUserById");
  assert(funcChunk.calls.includes("updateUserStatus"), "handleLogin should record call to updateUserStatus");
  assert(funcChunk.imports.includes("express"), "handleLogin chunk should track express import");

  // Find interface chunk
  const ifaceChunk = tsChunks.find((c) => c.symbolName === "UserSession");
  assert(ifaceChunk, "UserSession interface chunk should be extracted");
  console.log(`✓ AST chunking extracted ${tsChunks.length} chunks with symbol names, types, calls, and imports.`);

  // TEST 3: AST Chunking on Python
  console.log("\n[3/5] Testing Structural Chunking on Python...");
  const pySource = `
import os
import sys

class RepositoryScanner:
    def __init__(self, repo_path):
        self.repo_path = repo_path

    def scan_files(self):
        return os.listdir(self.repo_path)

def calculate_checksum(data):
    return hash(data)
`;
  const pyChunks = parseCodeToChunks("scanner.py", pySource);
  assert(pyChunks.length >= 2, "Python chunks should extract class and functions");
  const pyClass = pyChunks.find((c) => c.symbolName === "RepositoryScanner");
  assert(pyClass, "RepositoryScanner class chunk should be extracted");
  const pyFunc = pyChunks.find((c) => c.symbolName === "calculate_checksum");
  assert(pyFunc, "calculate_checksum function chunk should be extracted");
  console.log(`✓ Python chunking extracted ${pyChunks.length} structural chunks.`);

  // TEST 4: Embedding Service & Vector Space
  console.log("\n[4/5] Testing Vector Embeddings & Cosine Similarity...");
  const emb1 = await generateEmbedding("User authentication and JWT login handler");
  const emb2 = await generateEmbedding("Authentication verify token and session credentials");
  const emb3 = await generateEmbedding("CSS grid layout and flexbox margins padding color");

  assert.strictEqual(emb1.length, EMBEDDING_DIMENSION, `Embedding dimension should be ${EMBEDDING_DIMENSION}`);
  assert.strictEqual(emb2.length, EMBEDDING_DIMENSION);

  const simIdentical = cosineSimilarity(emb1, emb1);
  const simRelated = cosineSimilarity(emb1, emb2);
  const simUnrelated = cosineSimilarity(emb1, emb3);

  assert(Math.abs(simIdentical - 1.0) < 0.001, `Identical similarity should be ~1.0, got ${simIdentical}`);
  assert(simRelated > simUnrelated, `Related similarity (${simRelated.toFixed(3)}) should be greater than unrelated (${simUnrelated.toFixed(3)})`);

  const batchVectors = await generateEmbeddingsBatch(["first text", "second text"]);
  assert.strictEqual(batchVectors.length, 2);
  console.log(`✓ Embedding generation verified: dimension ${EMBEDDING_DIMENSION}, cosine similarity related=${simRelated.toFixed(3)} > unrelated=${simUnrelated.toFixed(3)}.`);

  // TEST 5: Context Assembly & Grounded Evidence Synthesis
  console.log("\n[5/5] Testing Grounded Response Generation & Citations...");
  const mockChunks = [
    {
      filePath: "src/auth/authManager.ts",
      symbolName: "handleLogin",
      symbolType: "function",
      startLine: 24,
      endLine: 34,
      content: `export async function handleLogin(req: any, res: any) {\n  const { username, password } = req.body;\n  const user = await findUserById(username);\n  return res.json({ success: true, user });\n}`,
      calls: ["findUserById"],
      imports: ["../services/user.service.js"],
      dependencies: ["express"],
    },
    {
      filePath: "src/auth/authManager.ts",
      symbolName: "AuthenticationManager",
      symbolType: "class",
      startLine: 12,
      endLine: 22,
      content: `export class AuthenticationManager {\n  public verifyToken(token: string): boolean {\n    return token.length > 10;\n  }\n}`,
      calls: [],
      imports: [],
      dependencies: [],
    },
  ];

  const retrievedItems = mockChunks.map((chunk) => ({
    chunk,
    score: 0.88,
    isDependencyContext: false,
  }));

  const assembledContext = assembleContextPrompt("antigravity-org/repoguardian", "main", "How does login work?", retrievedItems);
  assert(assembledContext.includes("src/auth/authManager.ts (Lines 24-34)"), "Assembled context must cite exact lines");
  assert(assembledContext.includes("handleLogin"), "Assembled context must include symbol name");

  const answerResult = await generateRepositoryAnswer(
    "antigravity-org/repoguardian",
    "main",
    "How does the login process work and where is it implemented?",
    retrievedItems
  );

  assert(answerResult.answer && answerResult.answer.length > 0, "Answer should be generated");
  assert(Array.isArray(answerResult.sources), "Sources should be an array");
  assert(answerResult.sources.length > 0, "Sources should have citations");
  assert(answerResult.sources[0].filePath === "src/auth/authManager.ts", "Citation should link to correct file");
  assert(answerResult.sources[0].startLine === 24, "Citation should have startLine");
  assert(answerResult.sources[0].endLine === 34, "Citation should have endLine");
  console.log(`✓ Grounded answer generated successfully with ${answerResult.sources.length} accurate citations:`);
  console.log(`   Source: ${answerResult.sources[0].filePath}:${answerResult.sources[0].startLine}-${answerResult.sources[0].endLine} (${answerResult.sources[0].symbolName})`);

  // TEST 6: Intent Classification
  console.log("\n[6/8] Testing Intent Classification...");
  assert.strictEqual(classifyQueryIntent("Explain the overall architecture and folder structure"), "architecture");
  assert.strictEqual(classifyQueryIntent("Which files define the database models, schemas, and entities?"), "database_models");
  assert.strictEqual(classifyQueryIntent("Find all API routes and controller handlers"), "api_routes");
  assert.strictEqual(classifyQueryIntent("Where is authentication handled and how does login work?"), "authentication");
  console.log("✓ Intent classification correctly detects architecture, models, routes, and auth queries.");

  // TEST 7: Repository Manifest & Architecture Q&A
  console.log("\n[7/8] Testing Repository Manifest & High-Level Architecture Analysis...");
  const mockFilePaths = [
    "backend/src/app.js",
    "backend/src/index.js",
    "backend/src/models/user.model.js",
    "backend/src/models/project.model.js",
    "backend/src/models/task.model.js",
    "backend/src/routes/project.routes.js",
    "backend/src/controllers/project.controller.js",
    "frontend/src/App.jsx",
    "frontend/src/pages/WorkspaceDetailPage.jsx",
    "package.json"
  ];

  const manifest = buildRepositoryManifest(mockFilePaths, {
    owner: "Manusangwan",
    name: "RepoGaurdian",
    branch: "main",
    commitSha: "a1b2c3d"
  });

  assert(manifest.rootFolders.includes("backend"), "Manifest should recognize backend root folder");
  assert(manifest.rootFolders.includes("frontend"), "Manifest should recognize frontend root folder");
  assert(manifest.entryPoints.includes("backend/src/app.js"), "Manifest should identify entry point");
  assert(manifest.models.includes("backend/src/models/user.model.js"), "Manifest should identify user model");
  assert(manifest.models.length >= 3, "Manifest should detect all 3 models");

  // Query: Architecture explanation
  const archAnswer = await generateRepositoryAnswer(
    "Manusangwan/RepoGaurdian",
    "main",
    "Explain the overall architecture and folder structure of this repository.",
    [],
    { manifest, intent: "architecture", isIndexing: false }
  );

  assert(archAnswer.answer.includes("Root Directory Structure"), "Arch answer must explain directory structure");
  assert(archAnswer.sources.length > 0, "Arch answer must provide source citations");
  assert(archAnswer.sources.some(s => s.filePath === "backend/src/app.js"), "Arch answer must cite app.js");
  console.log(`✓ Architecture query answered with ${archAnswer.sources.length} citations (Folder structure, Entry points, Models & Routes).`);

  // Query: Database models question
  const modelAnswer = await generateRepositoryAnswer(
    "Manusangwan/RepoGaurdian",
    "main",
    "Which files define the database models, schemas, and entities?",
    [],
    { manifest, intent: "database_models", isIndexing: false }
  );

  assert(modelAnswer.answer.includes("backend/src/models/user.model.js"), "Model answer must list user.model.js");
  assert(modelAnswer.sources.length >= 3, "Model answer must cite all model files");
  console.log(`✓ Database models query answered with ${modelAnswer.sources.length} model citations.`);

  // TEST 8: Immediate Prompting During Indexing
  console.log("\n[8/8] Testing Immediate Prompting During Indexing...");
  const indexingAnswer = await generateRepositoryAnswer(
    "Manusangwan/RepoGaurdian",
    "main",
    "Explain the overall architecture of this repository.",
    retrievedItems,
    {
      manifest,
      intent: "architecture",
      isIndexing: true,
      indexingStatus: { progress: 45, currentStep: "Indexing files...", indexedFiles: 12 }
    }
  );

  assert(indexingAnswer.answer.includes("Notice: Repository is currently"), "Should include transparent indexing notice");
  assert(indexingAnswer.sources.length > 0, "Should still return available grounded sources");
  console.log("✓ Immediate prompting during indexing delivers grounded partial knowledge with clear status notice.");

  console.log("\n========================================================");
  console.log("🎉 ALL RAG PIPELINE TESTS PASSED SUCCESSFULLY! (8/8)");
  console.log("========================================================\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
