import mongoose, { Schema } from "mongoose";

const codeChunkSchema = new Schema(
    {
        project: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true,
            index: true
        },
        repository: {
            owner: { type: String, required: true },
            name: { type: String, required: true }
        },
        branch: {
            type: String,
            required: true,
            default: "main",
            index: true
        },
        commitSha: {
            type: String,
            default: ""
        },
        filePath: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        fileName: {
            type: String,
            default: ""
        },
        fileExtension: {
            type: String,
            default: ""
        },
        language: {
            type: String,
            default: "text",
            index: true
        },
        symbolName: {
            type: String,
            default: "",
            trim: true,
            index: true
        },
        symbolType: {
            type: String,
            default: "block",
            index: true
        },
        startLine: {
            type: Number,
            required: true
        },
        endLine: {
            type: Number,
            required: true
        },
        content: {
            type: String,
            required: true
        },
        contextHeader: {
            type: String,
            default: ""
        },
        contentHash: {
            type: String,
            required: true,
            index: true
        },
        imports: {
            type: [String],
            default: [],
            index: true
        },
        calls: {
            type: [String],
            default: [],
            index: true
        },
        dependencies: {
            type: [String],
            default: [],
            index: true
        },
        embedding: {
            type: [Number],
            default: []
        },
        tokenCount: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

// Compound indexes for rapid filtered retrieval
codeChunkSchema.index({ project: 1, branch: 1, filePath: 1 });
codeChunkSchema.index({ project: 1, branch: 1, symbolName: 1 });
codeChunkSchema.index({ project: 1, branch: 1, symbolType: 1 });
codeChunkSchema.index({ project: 1, branch: 1, calls: 1 });
codeChunkSchema.index({ project: 1, branch: 1, contentHash: 1 });

// Full text index for keyword and symbol retrieval
codeChunkSchema.index(
    {
        content: "text",
        symbolName: "text",
        filePath: "text",
        calls: "text"
    },
    {
        weights: {
            symbolName: 10,
            filePath: 8,
            calls: 5,
            content: 2
        },
        name: "CodeChunkTextIndex"
    }
);

export const CodeChunk = mongoose.model("CodeChunk", codeChunkSchema);
