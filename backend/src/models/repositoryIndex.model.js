import mongoose, { Schema } from "mongoose";

const fileMetaSchema = new Schema(
    {
        path: { type: String, required: true },
        sha: { type: String, default: "" },
        contentHash: { type: String, default: "" },
        size: { type: Number, default: 0 },
        language: { type: String, default: "text" },
        chunkCount: { type: Number, default: 0 },
        symbolsCount: { type: Number, default: 0 },
        indexedAt: { type: Date, default: Date.now }
    },
    { _id: false }
);

const repositoryIndexSchema = new Schema(
    {
        project: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true,
            index: true
        },
        repository: {
            owner: { type: String, required: true, trim: true },
            name: { type: String, required: true, trim: true },
            url: { type: String, default: "" }
        },
        branch: {
            type: String,
            required: true,
            default: "main",
            index: true
        },
        status: {
            type: String,
            enum: [
                "idle",
                "not_indexed",
                "queued",
                "indexing",
                "partially_indexed",
                "completed",
                "failed"
            ],
            default: "not_indexed",
            index: true
        },
        progress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        currentStep: {
            type: String,
            default: ""
        },
        lastIndexedCommitSha: {
            type: String,
            default: ""
        },
        totalFiles: {
            type: Number,
            default: 0
        },
        indexedFiles: {
            type: Number,
            default: 0
        },
        totalChunks: {
            type: Number,
            default: 0
        },
        manifest: {
            type: Schema.Types.Mixed,
            default: null
        },
        languageStats: {
            type: Map,
            of: Number,
            default: {}
        },
        fileHashMap: {
            type: Map,
            of: fileMetaSchema,
            default: {}
        },
        error: {
            type: String,
            default: null
        },
        embeddingProvider: {
            type: String,
            default: "auto"
        },
        embeddingDimension: {
            type: Number,
            default: 384
        },
        startedAt: {
            type: Date,
            default: null
        },
        completedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

repositoryIndexSchema.index({ project: 1, branch: 1 }, { unique: true });
repositoryIndexSchema.index({ "repository.owner": 1, "repository.name": 1, branch: 1 });

export const RepositoryIndex = mongoose.model(
    "RepositoryIndex",
    repositoryIndexSchema
);
