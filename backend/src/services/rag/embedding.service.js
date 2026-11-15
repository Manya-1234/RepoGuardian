import crypto from "crypto";

/**
 * Deterministic Semantic Vectorizer (384 Dimensions).
 * Used when no external API key is provided, for automated testing, or as an offline fallback.
 * Uses sub-word n-gram hashing and TF-IDF weighted projection with L2 normalization.
 */
const generateDeterministicEmbedding = (text, dimensions = 384) => {
    const vector = new Array(dimensions).fill(0);
    if (!text || typeof text !== "string") return vector;

    const tokens = text
        .toLowerCase()
        .replace(/[^a-zA-Z0-9_\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);

    if (tokens.length === 0) return vector;

    // Token frequency map
    const tf = {};
    for (const t of tokens) {
        tf[t] = (tf[t] || 0) + 1;
    }

    // Hash tokens and character trigrams into the vector
    for (const [token, count] of Object.entries(tf)) {
        const weight = 1 + Math.log(count);

        // 1. Full word hash
        const hash = crypto.createHash("md5").update(token).digest();
        const bucket = hash.readUInt16BE(0) % dimensions;
        const sign = hash.readUInt8(2) % 2 === 0 ? 1 : -1;
        vector[bucket] += sign * weight * 2.0;

        // 2. Character trigram hashes (sub-word semantics)
        for (let i = 0; i <= token.length - 3; i++) {
            const trigram = token.substring(i, i + 3);
            const triHash = crypto.createHash("md5").update(trigram).digest();
            const triBucket = triHash.readUInt16BE(0) % dimensions;
            const triSign = triHash.readUInt8(2) % 2 === 0 ? 1 : -1;
            vector[triBucket] += triSign * weight * 0.5;
        }
    }

    // L2 Normalization
    let norm = 0;
    for (let i = 0; i < dimensions; i++) {
        norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
        for (let i = 0; i < dimensions; i++) {
            vector[i] = parseFloat((vector[i] / norm).toFixed(6));
        }
    }

    return vector;
};

/**
 * Generates embeddings via Google Gemini API (text-embedding-004).
 */
const generateGeminiEmbedding = async (text, apiKey) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "models/text-embedding-004",
            content: { parts: [{ text }] }
        })
    });

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini Embedding API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return data.embedding?.values || [];
};

/**
 * Generates embeddings via OpenAI API (text-embedding-3-small).
 */
const generateOpenAIEmbedding = async (text, apiKey) => {
    const url = "https://api.openai.com/v1/embeddings";
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            input: text,
            model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
        })
    });

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`OpenAI Embedding API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || [];
};

/**
 * Detects the active embedding provider based on environment variables.
 */
export const getActiveEmbeddingProvider = () => {
    const explicit = (process.env.EMBEDDING_PROVIDER || "").toLowerCase().trim();
    if (explicit === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
    if (explicit === "openai" && process.env.OPENAI_API_KEY) return "openai";
    if (explicit === "deterministic") return "deterministic";

    if (process.env.GEMINI_API_KEY) return "gemini";
    if (process.env.OPENAI_API_KEY) return "openai";

    return "deterministic";
};

/**
 * Generates an embedding vector for a single code chunk or query text.
 */
export const generateEmbedding = async (text) => {
    if (!text || text.trim() === "") {
        return new Array(384).fill(0);
    }

    const provider = getActiveEmbeddingProvider();

    try {
        if (provider === "gemini" && process.env.GEMINI_API_KEY) {
            return await generateGeminiEmbedding(text, process.env.GEMINI_API_KEY);
        }
        if (provider === "openai" && process.env.OPENAI_API_KEY) {
            return await generateOpenAIEmbedding(text, process.env.OPENAI_API_KEY);
        }
    } catch (err) {
        console.warn(`[EmbeddingService] Provider '${provider}' failed: ${err.message}. Falling back to deterministic embedding.`);
    }

    return generateDeterministicEmbedding(text, 384);
};

export const EMBEDDING_DIMENSION = 384;

/**
 * Generates embeddings in batches with concurrency and rate-limit considerations.
 */
export const generateBatchEmbeddings = async (texts, batchSize = 16) => {
    const results = [];
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchPromises = batch.map((text) => generateEmbedding(text));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }
    return results;
};

export const generateEmbeddingsBatch = generateBatchEmbeddings;

/**
 * Calculates Cosine Similarity between two numerical vectors.
 */
export const cosineSimilarity = (vecA, vecB) => {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    if (vecA.length !== vecB.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};
