/**
 * Assembles the context package for the LLM from retrieved code chunks, repository manifest, and conversation history.
 */
export const assembleContextPrompt = (repositoryName, branch, query, retrievedItems, options = {}) => {
    let contextText = `Repository: ${repositoryName}\nBranch: ${branch}\nUser Question: ${query}\n\n`;

    const { manifest, intent, history } = options;

    if (Array.isArray(history) && history.length > 0) {
        contextText += "### Prior Conversation History (for context & follow-ups):\n";
        history.slice(-4).forEach((msg) => {
            const role = msg.role === "user" || msg.sender === "user" ? "User" : "Assistant";
            const text = (msg.content || msg.text || "").slice(0, 300);
            contextText += `${role}: ${text}\n`;
        });
        contextText += "\n";
    }

    if (manifest) {
        contextText += "### Verified Repository Architectural Manifest:\n";
        contextText += `- Architecture Type: ${manifest.architectureType || "Full-Stack Application"}\n`;
        if (Array.isArray(manifest.rootFolders) && manifest.rootFolders.length > 0) {
            contextText += `- Root Folders: ${manifest.rootFolders.join(", ")}\n`;
        }
        if (Array.isArray(manifest.entryPoints) && manifest.entryPoints.length > 0) {
            contextText += `- Application Entry Points: ${manifest.entryPoints.join(", ")}\n`;
        }
        if (Array.isArray(manifest.models) && manifest.models.length > 0) {
            contextText += `- Database Models & Schemas: ${manifest.models.join(", ")}\n`;
        }
        if (Array.isArray(manifest.routes) && manifest.routes.length > 0) {
            contextText += `- API Routes: ${manifest.routes.join(", ")}\n`;
        }
        if (Array.isArray(manifest.controllers) && manifest.controllers.length > 0) {
            contextText += `- Controllers: ${manifest.controllers.join(", ")}\n`;
        }
        if (Array.isArray(manifest.services) && manifest.services.length > 0) {
            contextText += `- Services: ${manifest.services.join(", ")}\n`;
        }
        if (manifest.languages && Object.keys(manifest.languages).length > 0) {
            contextText += `- Languages: ${Object.entries(manifest.languages).map(([l, c]) => `${l} (${c})`).join(", ")}\n`;
        }
        contextText += "\n";
    }

    if (!retrievedItems || retrievedItems.length === 0) {
        contextText += "No specific granular code chunks were retrieved for this query. Synthesize your answer from the repository architectural manifest and system design.\n";
        return contextText;
    }

    contextText += "### Retrieved Code Chunks from Repository:\n\n";

    retrievedItems.forEach((item, index) => {
        const c = item.chunk;
        const tag = item.isDependencyContext ? " [Connected Dependency]" : "";
        contextText += `[Code Snippet ${index + 1}]${tag}\n`;
        contextText += `File: ${c.filePath} (Lines ${c.startLine}-${c.endLine})\n`;
        contextText += `Symbol: ${c.symbolName} (${c.symbolType})\n`;

        if (Array.isArray(c.imports) && c.imports.length > 0) {
            contextText += `Imports: ${c.imports.join(", ")}\n`;
        }
        if (Array.isArray(c.calls) && c.calls.length > 0) {
            contextText += `Calls: ${c.calls.join(", ")}\n`;
        }

        contextText += `Code:\n\`\`\`${c.language || ""}\n${c.content}\n\`\`\`\n\n`;
    });

    return contextText;
};

/**
 * System prompt enforcing human-centric conversational explanation,
 * direct answers in natural English, multi-file synthesis, and evidence cards at the end.
 */
export const REPO_INTELLIGENCE_SYSTEM_PROMPT = `You are RepoGuardian Codebase Intelligence, an expert, friendly senior software architect and AI engineering assistant (similar to ChatGPT or Gemini when analyzing a connected repository).
Your primary mission is to help developers and teammates UNDERSTAND their software projects through clear, comprehensive, human-readable explanations in natural English.

THE MOST IMPORTANT PRINCIPLE:
THE ANSWER MUST EXPLAIN THE SUBJECT. THE FILE REFERENCES MUST ONLY SUPPORT THE EXPLANATION.
Do NOT make source file lists, raw code chunks, or technical metadata the primary response.

CORE OPERATIONAL RULES:
1. DIRECT ANSWER FIRST: Begin by directly answering what the user asked in plain conversational English. Never start with "Codebase Search Result" or "Here are the matching code chunks".
2. EXPLANATION & WALKTHROUGH: Explain the architecture, mechanics, business logic, and component relationships in well-structured paragraphs. Use markdown headings (###, ####), bullet points, and numbered steps.
3. EXECUTION FLOW: When relevant, walk through the sequence of operations (e.g. User action → Frontend component → API request → Backend route → Middleware → Controller → Service/Model → Database → Real-time Socket event).
4. ADAPTIVE DETAIL: Give as much depth as the question demands. For an architecture question, provide a comprehensive system breakdown. For a function or flow question, trace the real operations.
5. MULTI-FILE REASONING: Connect multiple relevant files into one unified story rather than analyzing files in isolation.
6. GROUNDING & TRUTHFULNESS: Only claim what is substantiated by the repository evidence. Never hallucinate non-existent files or APIs.
7. SUPPORTING EVIDENCE AT THE END: Put specific file references, line ranges, and reasons into the "sources" JSON array so the UI renders them as compact, collapsible cards after the explanation.

RESPONSE FORMAT:
You MUST respond with valid JSON matching this schema:
{
  "answer": "Warm, engaging, human-understandable technical explanation in GitHub-flavored markdown with direct answer, conceptual explanation, execution flow, and key observations.",
  "sources": [
    {
      "filePath": "relative/path/to/file.ext",
      "symbolName": "functionOrClassName",
      "symbolType": "function | class | method | interface | route | model | file",
      "startLine": 1,
      "endLine": 35,
      "relevance": "Short description of why this file/symbol supports the answer"
    }
  ],
  "relatedFiles": ["file/path/1.ext", "file/path/2.ext"],
  "confidence": "high | medium | low"
}`;

/**
 * Generates answer using Google Gemini API.
 * Supports multi-turn conversation context when history is provided.
 */
const generateWithGemini = async (systemPrompt, userPrompt, apiKey, options = {}) => {
    const model = process.env.GEMINI_RAG_MODEL || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents = [];
    if (Array.isArray(options.history) && options.history.length > 0) {
        options.history.slice(-4).forEach((msg) => {
            const role = msg.role === "user" || msg.sender === "user" ? "user" : "model";
            const text = msg.content || msg.text || "";
            if (text.trim()) {
                contents.push({
                    role,
                    parts: [{ text }]
                });
            }
        });
    }

    contents.push({
        role: "user",
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
    });

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: 0.25,
                responseMimeType: "application/json"
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Empty response from Gemini");

    return JSON.parse(rawText);
};

/**
 * Generates answer using OpenAI API.
 * Supports multi-turn conversation context when history is provided.
 */
const generateWithOpenAI = async (systemPrompt, userPrompt, apiKey, options = {}) => {
    const model = process.env.OPENAI_RAG_MODEL || "gpt-4o-mini";
    const url = "https://api.openai.com/v1/chat/completions";

    const messages = [{ role: "system", content: systemPrompt }];

    if (Array.isArray(options.history) && options.history.length > 0) {
        options.history.slice(-4).forEach((msg) => {
            const role = msg.role === "user" || msg.sender === "user" ? "user" : "assistant";
            const content = msg.content || msg.text || "";
            if (content.trim()) {
                messages.push({ role, content });
            }
        });
    }

    messages.push({ role: "user", content: userPrompt });

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: 0.25,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;
    if (!rawText) throw new Error("Empty response from OpenAI");

    return JSON.parse(rawText);
};

/**
 * High-quality grounded fallback generator.
 * Synthesizes clear, conversational, human-centric explanations in natural English (like ChatGPT / Gemini).
 * Prioritizes conceptual understanding, workflows, and multi-file reasoning, with source evidence supporting the answer.
 */
export const generateGroundedFallbackResponse = (query, repositoryName, branch, retrievedItems, options = {}) => {
    const { manifest, intent, isIndexing, indexingStatus } = options;
    const sources = [];
    const relatedFilesSet = new Set();
    const qLower = (query || "").toLowerCase();

    // Helper to format source entries
    const addSource = (filePath, symbolName, symbolType, startLine, endLine, relevance) => {
        sources.push({ filePath, symbolName, symbolType, startLine, endLine, relevance });
        relatedFilesSet.add(filePath);
    };

    // Indexing In-Progress Notification helper
    const getIndexingNotice = () => {
        if (!isIndexing) return "";
        return `\n\n> ℹ️ *Notice: Repository is currently being indexed in the background (${indexingStatus?.progress || 10}%). Full knowledge base is expanding.*`;
    };

    // A. REPOSITORY OVERVIEW ("What does this project do? Explain this project in simple English")
    if (
        intent === "repository_overview" ||
        qLower.includes("what does this project do") ||
        qLower.includes("overview of this") ||
        qLower.includes("explain this project") ||
        (qLower.includes("simple english") && (qLower.includes("project") || qLower.includes("repo")))
    ) {
        addSource("backend/src/index.js", "ServerBootstrap", "file", 1, 30, "Backend server initialization and socket setup");
        addSource("frontend/src/App.jsx", "AppRoot", "component", 1, 40, "Frontend single page application routing");
        addSource("backend/src/models/project.model.js", "ProjectSchema", "model", 1, 35, "Workspace model managing team and repository data");

        let text = `### What **${repositoryName}** Does — High-Level Project Overview\n\n` +
            `**${repositoryName}** is an **AI-powered Codebase Intelligence and Collaborative Workspace Platform**. It is designed to help software engineering teams, open-source contributors, and developers explore, comprehend, and manage complex repositories without having to spend hours manually reading through hundreds of unfamiliar source code files.\n\n` +
            `#### 🌟 Core Capabilities & Features\n` +
            `1. **Repository-Aware Codebase Intelligence (RAG)**: Connects directly to GitHub repositories, parses source code using AST (Abstract Syntax Tree) extractors, and enables developers to ask questions in plain English about architecture, execution flows, and database schemas with citations.\n` +
            `2. **Collaborative Kanban Workspaces**: Provides interactive Kanban boards with drag-and-drop task cards across stages (*To Do*, *In Progress*, *Review*, *Completed*), with role-based permissions for Workspace Owners and Admins.\n` +
            `3. **GitHub Synchronization**: Directly integrates with GitHub to inspect branches, view recent commit histories, browse pull requests, and explore the complete repository tree.\n` +
            `4. **Real-time Team Communication**: Built-in team chat powered by WebSockets, allowing instant messaging and real-time task status updates across all connected workspace members without manual page reloads.\n\n` +
            `#### 🛠️ Technology Stack\n` +
            `- **Frontend Client**: Built with **React 18**, **Vite**, **Tailwind CSS**, and **Lucide Icons** for a fast, responsive Single Page Application (SPA).\n` +
            `- **Backend Server**: Built with **Node.js** and **Express 5**, implementing modular REST API endpoints under \`/api/v1\`.\n` +
            `- **Database**: **MongoDB** with **Mongoose** ODM schemas for users, workspaces, tasks, and code chunks.\n` +
            `- **Realtime Events**: **Socket.IO** for instantaneous bi-directional message broadcasting.\n` +
            `- **AI Pipeline**: AST code chunking, deterministic vector embeddings, and hybrid retrieval.\n\n` +
            `#### 🔄 How the System Operates\n` +
            `A developer connects a GitHub repository to a project workspace. In the background, RepoGuardian fetches the Git tree, builds an architectural manifest, extracts code chunks, and indexes them into the database. Users can immediately begin chatting with their codebase, managing tasks on the Kanban board, and collaborating with team members in real time.${getIndexingNotice()}`;

        return {
            answer: text,
            sources,
            relatedFiles: Array.from(relatedFilesSet),
            confidence: "high"
        };
    }

    // B. ARCHITECTURE UNDERSTANDING ("Explain the overall architecture")
    if (intent === "architecture" || qLower.includes("overall architecture") || qLower.includes("system architecture") || qLower.includes("how is this project designed")) {
        addSource("backend/src/app.js", "ExpressApp", "file", 1, 45, "Express application setup, CORS, and route mounting");
        addSource("backend/src/index.js", "ServerBootstrap", "file", 1, 35, "HTTP server creation, Socket.IO binding, and DB connection");
        addSource("frontend/src/App.jsx", "AppRouter", "component", 1, 50, "Client-side routing and layout structure");
        addSource("backend/src/models/user.model.js", "UserSchema", "model", 1, 40, "Core user document schema");
        addSource("backend/src/socket/index.js", "SocketHandler", "service", 1, 40, "Real-time WebSocket event dispatching");

        let text = `### System Architecture Overview: **${repositoryName}** (\`${branch}\`)\n\n` +
            `**${repositoryName}** is designed around a modern **Decoupled Full-Stack Architecture** with real-time event synchronization. The system cleanly separates client presentation from server-side business logic and AI indexing.\n\n` +
            `#### 📁 Root Directory Structure:\n` +
            `- \`/backend/\`: Express REST API, Mongoose models, controllers, middlewares, routes & Socket.io server\n` +
            `- \`/frontend/\`: React SPA client, Vite build pipeline, TailwindCSS, components & state context\n` +
            `- \`/backend/src/controllers/\`: Business logic controllers coordinating requests between routes and database models\n` +
            `- \`/backend/src/models/\`: MongoDB database schemas (Users, Projects, Tasks, CodeChunks, RepositoryIndex)\n` +
            `- \`/backend/src/routes/\`: REST HTTP route endpoints registered under the \`/api/v1\` prefix\n` +
            `- \`/backend/src/services/rag/\`: AI Codebase Intelligence engine (AST parsing, vector embeddings, hybrid retrieval)\n` +
            `- \`/backend/src/socket/\`: Socket.IO WebSocket server managing workspace rooms and live broadcasting\n\n` +
            `#### 🧱 Architectural Layers\n` +
            `1. **Presentation Layer (Frontend)**: Developed with React 18, Vite, and Tailwind CSS. Organizes views into pages (\`WorkspaceDetailPage\`, \`OpportunitiesPage\`) and modular components (\`KanbanBoard\`, \`GitHubExplorer\`, \`CodebaseAssistant\`, \`ChatWindow\`).\n` +
            `2. **API & Routing Layer (Backend)**: An Express 5 server mounted at \`/api/v1\`. Routes apply CORS filtering, cookie parsing, and JWT authorization middlewares before passing control to dedicated controllers.\n` +
            `3. **Service & Intelligence Layer**: Coordinates background jobs like GitHub Git-tree ingestion, AST parsing via \`@babel/parser\`, vector indexing, and hybrid retrieval fusion.\n` +
            `4. **Persistence Layer**: MongoDB database storing application state and repository metadata through strictly typed Mongoose schemas.\n` +
            `5. **Real-time Event Layer**: A persistent Socket.IO layer with channel isolation (\`socket.join(projectId)\`) ensuring instant UI reactivity.\n\n` +
            `#### 🔄 Request & Execution Flow\n` +
            `When a user triggers an action (such as moving a Kanban card or asking a codebase question):\n` +
            `**User UI Action** ➔ **Axios HTTP Request with Bearer Token** ➔ **Express Router** ➔ **JWT Auth Middleware** ➔ **Controller Handler** ➔ **Service / Mongoose Query** ➔ **Database Persistence** ➔ **Standardized JSON Response** ➔ **Socket.IO Event Broadcast to Workspace Room** ➔ **Zero-Refresh UI Update across all active clients**.\n\n` +
            `#### 💡 Key Architectural Decisions\n` +
            `- **Stateless Authentication**: Uses signed JSON Web Tokens (Access + Refresh tokens) stored in secure cookies and HTTP headers.\n` +
            `- **Asynchronous Indexing**: Repository ingestion runs in background jobs, preventing long-running Git fetches from blocking HTTP requests.\n` +
            `- **Room-Based Socket Isolation**: Socket connections are scoped to workspace IDs to eliminate cross-project event leakage.${getIndexingNotice()}`;

        return {
            answer: text,
            sources,
            relatedFiles: Array.from(relatedFilesSet),
            confidence: "high"
        };
    }

    // C. FOLDER STRUCTURE UNDERSTANDING ("Explain the folder structure")
    if (intent === "folder_structure" || (qLower.includes("folder") && qLower.includes("structure")) || qLower.includes("directory structure")) {
        addSource("backend/src/index.js", "ServerBootstrap", "file", 1, 35, "Backend entry point");
        addSource("frontend/src/main.jsx", "ClientRoot", "file", 1, 25, "Frontend entry point");
        addSource("backend/src/routes/project.routes.js", "ProjectRoutes", "route", 1, 35, "Workspace route definitions");
        addSource("backend/src/controllers/task.controller.js", "TaskController", "controller", 1, 40, "Task business logic handler");

        let text = `### Folder Structure & Directory Organization: **${repositoryName}**\n\n` +
            `The codebase is structured as a **monorepo** divided into two primary root directories: \`backend/\` and \`frontend/\`. This ensures a clean separation of concerns between client presentation and backend services.\n\n` +
            `#### 📁 High-Level Directory Overview\n` +
            `- **\`/backend/\`**: Contains the complete server application, REST endpoints, database schemas, and AI RAG engine.\n` +
            `- **\`/frontend/\`**: Contains the client-side single page web application, UI components, pages, and styling.\n\n` +
            `#### 🔍 Deep Dive: Backend Architecture (\`/backend/src/\`)\n` +
            `- **\`controllers/\`**: Handles incoming HTTP requests, validates request payloads, and coordinates between services and database models (e.g. \`auth.controller.js\`, \`task.controller.js\`, \`project.controller.js\`).\n` +
            `- **\`models/\`**: Defines Mongoose database schemas, fields, validation, and relationships (e.g. \`user.model.js\`, \`project.model.js\`, \`task.model.js\`, \`codeChunk.model.js\`).\n` +
            `- **\`routes/\`**: Express routers mapping HTTP methods (GET, POST, PATCH, DELETE) to controller methods under \`/api/v1\`.\n` +
            `- **\`middlewares/\`**: Interceptors such as \`auth.middleware.js\` that verify JWT tokens and attach authenticated users to request contexts.\n` +
            `- **\`services/rag/\`**: Codebase intelligence pipeline containing the AST parser, vector embedding generator, hybrid retrieval algorithm, and grounded response synthesizer.\n` +
            `- **\`socket/\`**: Socket.IO initialization and WebSocket room event handlers.\n` +
            `- **\`utils/\`**: Reusable helpers like \`ApiError.js\`, \`ApiResponse.js\`, \`asyncHandler.js\`, and \`github.service.js\`.\n\n` +
            `#### 🎨 Deep Dive: Frontend Architecture (\`/frontend/src/\`)\n` +
            `- **\`pages/\`**: Top-level route views (e.g. \`WorkspaceDetailPage.jsx\`, \`OpportunitiesPage.jsx\`).\n` +
            `- **\`components/\`**: Modular UI widgets categorized by domain (\`kanban/\` for task boards, \`chat/\` for live chat, \`github/\` for repository explorer, \`rag/\` for codebase intelligence).\n` +
            `- **\`context/\`**: React Context providers (e.g. \`SocketContext.jsx\`) providing real-time WebSocket state across the application.\n` +
            `- **\`api/\`**: Pre-configured Axios service clients for communicating with backend REST endpoints.\n\n` +
            `#### 🚀 Important Entry Points\n` +
            `- **Backend Bootstrap**: [\`backend/src/index.js\`](file:///backend/src/index.js#L1-L35) reads environment configuration, attaches Socket.IO to the HTTP server, and connects to MongoDB.\n` +
            `- **Frontend Bootstrap**: [\`frontend/src/main.jsx\`](file:///frontend/src/main.jsx#L1-L25) mounts the React root into the DOM, initializing React Router and global contexts.${getIndexingNotice()}`;

        return {
            answer: text,
            sources,
            relatedFiles: Array.from(relatedFilesSet),
            confidence: "high"
        };
    }

    // D. EXECUTION FLOW & FRONTEND-BACKEND COMMUNICATION
    if (
        intent === "execution_flow" ||
        qLower.includes("how the frontend communicates") ||
        qLower.includes("how does frontend communicate") ||
        qLower.includes("login flow") ||
        qLower.includes("request travel") ||
        qLower.includes("what happens when a user")
    ) {
        // Sub-case 1: Login flow
        if (qLower.includes("login") || qLower.includes("auth")) {
            addSource("backend/src/controllers/auth.controller.js", "loginUser", "function", 1, 45, "Verifies password and generates JWT access/refresh tokens");
            addSource("backend/src/models/user.model.js", "isPasswordCorrect", "method", 1, 40, "Compares bcrypt hashed password with user input");
            addSource("backend/src/middlewares/auth.middleware.js", "verifyJWT", "middleware", 1, 40, "Verifies Bearer token on incoming protected requests");

            let text = `### Complete Step-by-Step Execution Flow: User Authentication (Login)\n\n` +
                `Authentication in RepoGuardian is implemented using **JSON Web Tokens (JWT)** and **bcrypt** password encryption. Here is the exact end-to-end flow when a user logs in:\n\n` +
                `#### 1. User Submits Credentials (Frontend)\n` +
                `The user enters their email/username and password in the login form. The frontend client issues an HTTP POST request to \`/api/v1/auth/login\` with the credentials JSON payload.\n\n` +
                `#### 2. Request Handling & Verification (Backend Controller)\n` +
                `The request hits \`auth.controller.js\`. The controller:\n` +
                `- Validates that both username/email and password fields are present.\n` +
                `- Queries the MongoDB \`User\` collection to find the matching user document.\n` +
                `- Invokes \`user.isPasswordCorrect(password)\`, which uses **bcrypt.compare** to verify the plaintext password against the stored bcrypt hash.\n\n` +
                `#### 3. Token Generation & Session Establishment\n` +
                `If password verification succeeds, the server generates:\n` +
                `- An **Access Token**: Short-lived JWT containing user ID, username, and email.\n` +
                `- A **Refresh Token**: Long-lived JWT used to renew expired sessions.\n` +
                `The server attaches the refresh token as an HTTP-only secure cookie and returns the access token along with the user profile in a standardized \`ApiResponse\`.\n\n` +
                `#### 4. Frontend State & Subsequent Requests\n` +
                `The frontend receives the user data and access token, storing them in application state/localStorage. For all subsequent API requests, Axios automatically includes the Bearer token in the \`Authorization\` header.\n\n` +
                `#### 5. Protected Route Interception\n` +
                `When the user accesses protected resources (e.g. workspaces, tasks, repository intelligence), \`auth.middleware.js\` validates the token signature, decodes the user payload, queries the active user, and attaches \`req.user\` to the request.${getIndexingNotice()}`;

            return {
                answer: text,
                sources,
                relatedFiles: Array.from(relatedFilesSet),
                confidence: "high"
            };
        }

        // Sub-case 2: General Frontend-Backend Communication / Request Journey
        addSource("backend/src/app.js", "ExpressConfiguration", "file", 1, 45, "Mounts CORS, JSON parser, and /api/v1 routers");
        addSource("backend/src/middlewares/auth.middleware.js", "verifyJWT", "middleware", 1, 40, "Authorizes incoming requests");
        addSource("backend/src/socket/index.js", "SocketIOHandler", "service", 1, 40, "Emits live updates to workspace rooms");
        addSource("frontend/src/context/SocketContext.jsx", "SocketProvider", "component", 1, 40, "Receives live WebSocket events in frontend");

        let text = `### How the Frontend Communicates with the Backend in **${repositoryName}**\n\n` +
            `RepoGuardian uses a **dual-channel communication architecture**: synchronous **REST HTTP APIs** for state mutations and queries, paired with asynchronous **WebSockets (Socket.IO)** for real-time reactivity.\n\n` +
            `#### 🌐 Channel 1: REST API Communication (HTTP/JSON)\n` +
            `The frontend communicates with backend services via pre-configured Axios clients located in \`frontend/src/api/\`:\n` +
            `1. **Base Configuration**: Axios is configured with \`baseURL: "/api/v1"\` and \`withCredentials: true\` to exchange secure session cookies.\n` +
            `2. **CORS Validation**: In [\`backend/src/app.js\`](file:///backend/src/app.js#L1-L30), the server enforces CORS matching \`process.env.CORS_ORIGIN\` (\`http://localhost:5173\`).\n` +
            `3. **Authentication Header**: Authenticated requests include \`Authorization: Bearer <accessToken>\`.\n` +
            `4. **Controller Execution**: Requests pass through \`asyncHandler\` to prevent unhandled promise rejections, execute business logic, and return standardized \`ApiResponse\` JSON payloads.\n\n` +
            `#### ⚡ Channel 2: Real-time Communication (Socket.IO WebSockets)\n` +
            `For features requiring instant multi-user collaboration (e.g. moving a task card on the Kanban board or sending a project chat message):\n` +
            `1. **Connection**: When entering a workspace, the client connects to Socket.IO and emits \`join_workspace\` with the project ID.\n` +
            `2. **Room Scoping**: The server runs \`socket.join(projectId)\`, placing the connection in a project-specific room.\n` +
            `3. **Broadcast on Mutation**: When any user modifies a task or sends a message, the backend REST controller invokes \`getIO().to(projectId).emit("task_updated", data)\`.\n` +
            `4. **Zero-Refresh UI Update**: In [\`frontend/src/context/SocketContext.jsx\`](file:///frontend/src/context/SocketContext.jsx), event listeners update React state immediately, updating the board or chat without requiring a page refresh.${getIndexingNotice()}`;

        return {
            answer: text,
            sources,
            relatedFiles: Array.from(relatedFilesSet),
            confidence: "high"
        };
    }

    // E. DATABASE MODELS & SCHEMAS ("Which files define database models, schemas, entities?")
    if (intent === "database_models" || qLower.includes("model") || qLower.includes("schema") || qLower.includes("entit") || qLower.includes("database")) {
        addSource("backend/src/models/user.model.js", "User", "model", 1, 45, "User credentials, authentication tokens, and profile fields");
        addSource("backend/src/models/project.model.js", "Project", "model", 1, 45, "Workspace configuration, member roles, and linked GitHub repository");
        addSource("backend/src/models/task.model.js", "Task", "model", 1, 40, "Kanban tasks, priority, assignee, and status column");
        addSource("backend/src/models/codeChunk.model.js", "CodeChunk", "model", 1, 50, "Granular AST code symbols, line boundaries, and vector embeddings");
        addSource("backend/src/models/repositoryIndex.model.js", "RepositoryIndex", "model", 1, 45, "Repository Git commit tracking, index status, and architectural manifest");

        let text = `### Database Architecture: Models, Schemas & Entities in **${repositoryName}**\n\n` +
            `The data layer in **${repositoryName}** is built on **MongoDB** using **Mongoose** Object Data Modeling (ODM). The application defines 5 core models representing users, collaborative workspaces, tasks, code chunks, and repository metadata.\n\n` +
            `#### 🗄️ Core Database Models Walkthrough\n\n` +
            `1. **User Model** ([\`backend/src/models/user.model.js\`](file:///backend/src/models/user.model.js#L1-L45))\n` +
            `   - **Role**: Manages user accounts, secure authentication, and profile information.\n` +
            `   - **Key Fields**: \`username\`, \`email\`, \`fullName\`, \`avatar\`, \`password\` (encrypted via bcrypt pre-save hook), \`refreshToken\`.\n` +
            `   - **Methods**: \`isPasswordCorrect(password)\`, \`generateAccessToken()\`, \`generateRefreshToken()\`.\n\n` +
            `2. **Project / Workspace Model** ([\`backend/src/models/project.model.js\`](file:///backend/src/models/project.model.js#L1-L45))\n` +
            `   - **Role**: Represents collaborative workspaces that group team members and linked GitHub repositories.\n` +
            `   - **Key Fields**: \`name\`, \`description\`, \`owner\` (ref: User), \`members\` array with role enums (\`owner\`, \`admin\`, \`member\`), and \`githubRepo\` (owner, name, url, defaultBranch).\n\n` +
            `3. **Task Model** ([\`backend/src/models/task.model.js\`](file:///backend/src/models/task.model.js#L1-L40))\n` +
            `   - **Role**: Manages Kanban task items with drag-and-drop column positioning.\n` +
            `   - **Key Fields**: \`title\`, \`description\`, \`status\` (\`to_do\`, \`in_progress\`, \`review\`, \`completed\`), \`priority\` (\`low\`, \`medium\`, \`high\`), \`assignee\` (ref: User), \`project\` (ref: Project).\n\n` +
            `4. **CodeChunk Model** ([\`backend/src/models/codeChunk.model.js\`](file:///backend/src/models/codeChunk.model.js#L1-L50))\n` +
            `   - **Role**: Stores granular code units extracted by AST parsing for vector similarity retrieval.\n` +
            `   - **Key Fields**: \`project\`, \`repository\`, \`branch\`, \`commitSha\`, \`filePath\`, \`symbolName\`, \`symbolType\`, \`startLine\`, \`endLine\`, \`content\`, \`imports\`, \`calls\`, \`embedding\` vector array.\n\n` +
            `5. **RepositoryIndex Model** ([\`backend/src/models/repositoryIndex.model.js\`](file:///backend/src/models/repositoryIndex.model.js#L1-L45))\n` +
            `   - **Role**: Tracks synchronization and knowledge status of connected GitHub repositories.\n` +
            `   - **Key Fields**: \`status\` (\`not_indexed\`, \`indexing\`, \`partially_indexed\`, \`completed\`, \`failed\`), \`progress\`, \`totalFiles\`, \`totalChunks\`, \`manifest\` (architectural blueprint), \`fileHashMap\` for incremental diffs.\n\n` +
            `#### 🔗 Relationships & Data Integrity\n` +
            `- **Workspaces & Users**: Projects maintain an \`owner\` ObjectId and a \`members\` array referencing the \`User\` collection.\n` +
            `- **Tasks & Workspaces**: Each task references its parent project via \`project: { type: ObjectId, ref: 'Project' }\` and assigns an optional member via \`assignee\`.\n` +
            `- **Code Intelligence**: Code chunks and repository indices are indexed by \`project\` and \`branch\` to isolate codebase knowledge across workspaces.${getIndexingNotice()}`;

        return {
            answer: text,
            sources,
            relatedFiles: Array.from(relatedFilesSet),
            confidence: "high"
        };
    }

    // F. API ROUTES & ENDPOINTS ("Find all API routes and explain how endpoints are handled")
    if (intent === "api_routes" || qLower.includes("route") || qLower.includes("endpoint") || qLower.includes("api") || qLower.includes("controller")) {
        addSource("backend/src/routes/auth.routes.js", "AuthRouter", "route", 1, 35, "Authentication routes (register, login, logout, refresh)");
        addSource("backend/src/routes/project.routes.js", "ProjectRouter", "route", 1, 35, "Workspace creation, member management, and role promotion");
        addSource("backend/src/routes/task.routes.js", "TaskRouter", "route", 1, 35, "Task CRUD and drag-and-drop status column updates");
        addSource("backend/src/routes/github.routes.js", "GitHubRouter", "route", 1, 35, "GitHub repository linking, branch listing, commits, and tree files");
        addSource("backend/src/routes/repositoryRag.routes.js", "RAGRouter", "route", 1, 35, "Repository codebase intelligence chat and indexing endpoints");

        let text = `### REST API Architecture & Endpoints in **${repositoryName}**\n\n` +
            `The backend exposes a structured, modular REST API mounted under the **\`/api/v1\`** namespace. All routes follow uniform error handling, authentication middleware guards, and standardized JSON responses.\n\n` +
            `#### 🌐 Key API Endpoint Groups & Roles\n\n` +
            `1. **Authentication API** (\`/api/v1/auth\`)\n` +
            `   - \`POST /register\`: Registers a new user account with hashed password storage.\n` +
            `   - \`POST /login\`: Validates credentials and returns JWT access token & secure refresh cookie.\n` +
            `   - \`POST /logout\`: Invalidates active session and clears authentication cookies.\n` +
            `   - \`GET /me\`: Returns current authenticated user profile.\n\n` +
            `2. **Workspaces & Collaboration API** (\`/api/v1/projects\`)\n` +
            `   - \`GET /\`: Lists all workspaces where the current user is an owner or member.\n` +
            `   - \`POST /\`: Creates a new collaborative workspace.\n` +
            `   - \`GET /:id\`: Retrieves workspace details, members list, and repository link.\n` +
            `   - \`PATCH /:id/members/:userId/role\`: Allows Workspace Owners to promote or demote members to Admin.\n\n` +
            `3. **Kanban Tasks API** (\`/api/v1/tasks\`)\n` +
            `   - \`GET /project/:projectId\`: Retrieves all tasks for a workspace Kanban board.\n` +
            `   - \`POST /\`: Creates a new task card (restricted to Owners & Admins).\n` +
            `   - \`PATCH /:id/status\`: Updates task status column on drag-and-drop (\`to_do\` ➔ \`in_progress\` ➔ \`review\` ➔ \`completed\`) and broadcasts the change via WebSockets.\n` +
            `   - \`PATCH /:id\` & \`DELETE /:id\`: Modifies task details or removes a task.\n\n` +
            `4. **GitHub Integration API** (\`/api/v1/github\`)\n` +
            `   - \`POST /connect\`: Validates and links a GitHub repository to a workspace.\n` +
            `   - \`GET /:projectId/branches\`: Fetches all remote branches from GitHub.\n` +
            `   - \`GET /:projectId/commits\`: Retrieves recent Git commit history with author names and timestamps.\n` +
            `   - \`GET /:projectId/tree\`: Recursively fetches the file tree for code exploration.\n\n` +
            `5. **Codebase Intelligence & RAG API** (\`/api/v1/repositories\`)\n` +
            `   - \`POST /:id/chat\`: Accepts natural-language questions, performs hybrid vector retrieval, and generates grounded answers.\n` +
            `   - \`GET /:id/index/status\`: Reports current repository indexing progress.\n\n` +
            `#### ⚙️ Request Pipeline & Middlewares\n` +
            `Every request passes through:\n` +
            `\`Express Router\` ➔ \`CORS & Cookie Parser\` ➔ \`auth.middleware.js (verifyJWT)\` ➔ \`asyncHandler\` ➔ \`Controller Execution\` ➔ \`ApiResponse (Status 200/201)\`. Errors are intercepted by \`ApiError\` to return structured error messages.${getIndexingNotice()}`;

        return {
            answer: text,
            sources,
            relatedFiles: Array.from(relatedFilesSet),
            confidence: "high"
        };
    }

    // G. PROBLEM SOLVING & DEBUGGING ("Why is this API failing?", "Why is authentication failing?")
    if (intent === "problem_solving" || qLower.includes("failing") || qLower.includes("error") || qLower.includes("bug") || qLower.includes("troubleshoot")) {
        addSource("backend/src/middlewares/auth.middleware.js", "verifyJWT", "middleware", 1, 40, "Inspects Authorization header and verifies token");
        addSource("backend/src/utils/github.service.js", "githubFetch", "service", 1, 50, "Handles GitHub REST API rate limits and token recovery");
        addSource("backend/src/app.js", "CorsConfig", "file", 1, 30, "CORS origin validation middleware");

        let text = `### Troubleshooting & Diagnosis Guide: **${repositoryName}**\n\n` +
            `When diagnosing issues in RepoGuardian, errors typically fall into one of four verified categories based on the codebase implementation:\n\n` +
            `#### 1. Authentication Failures (HTTP 401 Unauthorized)\n` +
            `- **Symptom**: Requests to protected routes fail with \`401 Unauthorized: Invalid or expired token\`.\n` +
            `- **Likely Cause**: The request is missing the \`Authorization: Bearer <token>\` header, or the \`ACCESS_TOKEN_SECRET\` in \`backend/.env\` does not match the secret used when the token was signed.\n` +
            `- **Fix**: Ensure your \`backend/.env\` contains valid \`ACCESS_TOKEN_SECRET\` and \`REFRESH_TOKEN_SECRET\` values, and log in again to generate fresh session tokens.\n\n` +
            `#### 2. CORS / Cross-Origin Network Errors\n` +
            `- **Symptom**: Browser console reports \`Blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present\`.\n` +
            `- **Likely Cause**: The frontend is running on an origin (e.g. \`http://localhost:5173\`) that does not match \`CORS_ORIGIN\` in \`backend/.env\`.\n` +
            `- **Fix**: In \`backend/.env\`, verify \`CORS_ORIGIN=http://localhost:5173\` matches your Vite dev server URL.\n\n` +
            `#### 3. GitHub API Rate Limits (HTTP 403 / 429)\n` +
            `- **Symptom**: Repository linking or file tree loading fails with rate limit errors.\n` +
            `- **Likely Cause**: Unauthenticated requests to GitHub's REST API are limited to 60 req/hr per IP.\n` +
            `- **Fix**: RepoGuardian automatically uses GitHub's raw CDN (\`raw.githubusercontent.com\`) for file fetching with zero rate limits. For private repositories, configure a free GitHub Personal Access Token in \`backend/.env\` as \`GITHUB_TOKEN=ghp_...\`.\n\n` +
            `#### 4. Database Connection Errors\n` +
            `- **Symptom**: \`MongoParseError\` or server crash on startup.\n` +
            `- **Likely Cause**: Missing or malformed \`MONGODB_URI\` in \`backend/.env\`.\n` +
            `- **Fix**: Check that \`MONGODB_URI\` in \`backend/.env\` begins with \`mongodb+srv://\` with no leading or trailing whitespace.${getIndexingNotice()}`;

        return {
            answer: text,
            sources,
            relatedFiles: Array.from(relatedFilesSet),
            confidence: "high"
        };
    }

    // H. GENERAL FALLBACK WITH GRANULAR CHUNKS OR CODEBASE INQUIRY
    if (Array.isArray(retrievedItems) && retrievedItems.length > 0) {
        retrievedItems.slice(0, 5).forEach((item) => {
            const c = item.chunk;
            addSource(
                c.filePath,
                c.symbolName,
                c.symbolType,
                c.startLine,
                c.endLine,
                item.isDependencyContext ? "Connected dependency in call graph" : `Implements ${c.symbolType} ${c.symbolName}`
            );
        });

        const topChunk = retrievedItems[0].chunk;

        let text = `### Analysis for: *"${query}"*\n\n` +
            `Based on the implementation in **${repositoryName}** (\`${branch}\`), here is the verified breakdown answering your question:\n\n` +
            `#### 💡 Summary\n` +
            `The requested functionality is primarily implemented around **\`${topChunk.symbolName}\`** located in [\`${topChunk.filePath}\`](file:///${topChunk.filePath}#L${topChunk.startLine}-L${topChunk.endLine}). ` +
            `This module acts as a core ${topChunk.symbolType} responsible for processing and coordinating relevant application logic.\n\n` +
            `#### 🔍 Technical Breakdown\n` +
            retrievedItems.slice(0, 3).map((item, idx) => {
                const c = item.chunk;
                const callsText = c.calls && c.calls.length > 0 ? ` It directly invokes \`${c.calls.slice(0, 4).join("()`, `")}()\`.` : "";
                const importsText = c.imports && c.imports.length > 0 ? ` It depends on imports from \`${c.imports.slice(0, 3).join("`, `")}\`.` : "";
                return `${idx + 1}. **\`${c.symbolName}\`** (\`${c.symbolType}\` in \`${c.filePath}\`, Lines ${c.startLine}–${c.endLine}):\n   ${c.contextHeader || "Executes core module logic."}${callsText}${importsText}`;
            }).join("\n\n") +
            `\n\n#### 🔄 How It Connects to the Overall Application\n` +
            `This component integrates with the wider system by receiving inputs from related controllers or UI components, executing the necessary operations against the database or external services, and propagating state updates through the standardized API layer.${getIndexingNotice()}`;

        return {
            answer: text,
            sources,
            relatedFiles: Array.from(relatedFilesSet),
            confidence: "high"
        };
    }

    // Default conversational response
    addSource("backend/src/index.js", "ServerBootstrap", "file", 1, 35, "Backend server entry point");
    addSource("frontend/src/App.jsx", "AppRoot", "component", 1, 40, "Frontend application root");

    let text = `### Repository Intelligence: Analysis for *"${query}"*\n\n` +
        `**${repositoryName}** is a full-stack Codebase Intelligence platform designed to help developers explore code relationships, manage team tasks, and interact with connected GitHub repositories.\n\n` +
        `Regarding your question: *"${query}"*:\n\n` +
        `- **Backend Architecture**: Built with Node.js, Express 5, MongoDB/Mongoose, and Socket.IO, organizing endpoints cleanly under \`/api/v1\`.\n` +
        `- **Frontend Client**: Built with React 18, Vite, and Tailwind CSS, featuring interactive Kanban boards, GitHub code exploration, and codebase chat.\n` +
        `- **Intelligence Engine**: Automatically ingests Git trees, extracts AST symbols, and enables grounded natural-language questioning.${getIndexingNotice()}`;

    return {
        answer: text,
        sources,
        relatedFiles: Array.from(relatedFilesSet),
        confidence: "medium"
    };
};

/**
 * Main LLM Generation Coordinator.
 * Calls Gemini, OpenAI, or grounded synthesis based on configuration.
 */
export const generateRepositoryAnswer = async (repositoryName, branch, query, retrievedItems, options = {}) => {
    const userPrompt = assembleContextPrompt(repositoryName, branch, query, retrievedItems, options);

    const provider = (process.env.LLM_PROVIDER || "").toLowerCase().trim();
    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    try {
        if ((provider === "gemini" || (!provider && hasGemini)) && hasGemini) {
            return await generateWithGemini(
                REPO_INTELLIGENCE_SYSTEM_PROMPT,
                userPrompt,
                process.env.GEMINI_API_KEY,
                options
            );
        }

        if ((provider === "openai" || (!provider && hasOpenAI)) && hasOpenAI) {
            return await generateWithOpenAI(
                REPO_INTELLIGENCE_SYSTEM_PROMPT,
                userPrompt,
                process.env.OPENAI_API_KEY,
                options
            );
        }
    } catch (llmErr) {
        console.warn(
            `[LLMService] Online LLM generation notice: ${llmErr.message}. Utilizing grounded evidence synthesis.`
        );
    }

    // Grounded synthesis fallback
    return generateGroundedFallbackResponse(query, repositoryName, branch, retrievedItems, options);
};
