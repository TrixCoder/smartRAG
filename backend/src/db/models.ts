import mongoose, { Schema, Document } from "mongoose";

// Chat Session Schema
export interface IChatSession extends Document {
    userId?: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
}

const ChatSessionSchema = new Schema<IChatSession>({
    userId: { type: String, index: true },
    title: { type: String, default: "New Chat" },
}, { timestamps: true });

export const ChatSession = mongoose.model<IChatSession>("ChatSession", ChatSessionSchema);

// Chat Message Schema
export interface IChatMessage extends Document {
    sessionId: mongoose.Types.ObjectId;
    role: "user" | "assistant";
    content: string;
    strategy?: string;
    reasoningTrace?: string;
    executionPlan?: string[];
    sourceNodes?: Array<{
        id: string;
        content: string;
        type: string;
        score?: number;
    }>;
    createdAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>({
    sessionId: { type: Schema.Types.ObjectId, ref: "ChatSession", required: true, index: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    strategy: String,
    reasoningTrace: String,
    executionPlan: [String],
    sourceNodes: [{
        id: String,
        content: String,
        type: String,
        score: Number
    }]
}, { timestamps: true });

export const ChatMessage = mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);

// File Metadata Schema
export interface IFileMetadata extends Document {
    sessionId?: mongoose.Types.ObjectId;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    fileType: "pdf" | "csv" | "json" | "text" | "image" | "audio" | "video" | "other";
    hasRelationalData: boolean;
    extractedEntities?: string[];
    vectorIds?: string[];
    graphNodeIds?: string[];
    createdAt: Date;
}

const FileMetadataSchema = new Schema<IFileMetadata>({
    sessionId: { type: Schema.Types.ObjectId, ref: "ChatSession", index: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    fileType: {
        type: String,
        enum: ["pdf", "csv", "json", "text", "image", "audio", "video", "other"],
        default: "other"
    },
    hasRelationalData: { type: Boolean, default: false },
    extractedEntities: [String],
    vectorIds: [String],
    graphNodeIds: [String]
}, { timestamps: true });

export const FileMetadata = mongoose.model<IFileMetadata>("FileMetadata", FileMetadataSchema);

// Vector Chunk Schema - stores embedded chunks
export interface IVectorChunk extends Document {
    fileId: mongoose.Types.ObjectId;
    content: string;
    embedding: number[];
    chunkIndex: number;
    totalChunks: number;
    strategy: "semantic" | "fixed" | "sentence";
    createdAt: Date;
}

const VectorChunkSchema = new Schema<IVectorChunk>({
    fileId: { type: Schema.Types.ObjectId, ref: "FileMetadata", required: true, index: true },
    content: { type: String, required: true },
    embedding: { type: [Number], required: true },
    chunkIndex: { type: Number, required: true },
    totalChunks: { type: Number, required: true },
    strategy: { type: String, enum: ["semantic", "fixed", "sentence"], default: "sentence" }
}, { timestamps: true });

// Index for vector similarity search (if using MongoDB Atlas Vector Search)
VectorChunkSchema.index({ embedding: 1 });

export const VectorChunk = mongoose.model<IVectorChunk>("VectorChunk", VectorChunkSchema);

// Graph Cache Schema
export interface IGraphCache extends Document {
    sessionId: mongoose.Types.ObjectId;
    entities: Array<{ name: string; type: string; properties?: Record<string, any> }>;
    relationships: Array<{ from: string; to: string; type: string; properties?: Record<string, any> }>;
    cypherScript?: string;
    createdAt: Date;
}

const GraphCacheSchema = new Schema<IGraphCache>({
    sessionId: { type: Schema.Types.ObjectId, ref: "ChatSession", required: true, index: true },
    entities: [{
        name: String,
        type: String,
        properties: Schema.Types.Mixed
    }],
    relationships: [{
        from: String,
        to: String,
        type: String,
        properties: Schema.Types.Mixed
    }],
    cypherScript: String
}, { timestamps: true });

export const GraphCache = mongoose.model<IGraphCache>("GraphCache", GraphCacheSchema);
