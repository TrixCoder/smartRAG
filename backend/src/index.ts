import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { typeDefs } from "./graphql/schema";
import { resolvers } from "./graphql/resolvers";
import { connectDB, FileMetadata, GraphCache } from "./db";
import { GeminiService } from "./services/gemini";
import dotenv from "dotenv";

dotenv.config();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + "-" + file.originalname);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (_req, file, cb) => {
        const allowedTypes = [
            "application/pdf",
            "text/csv",
            "application/json",
            "text/plain",
            "image/png",
            "image/jpeg",
            "image/webp",
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type"));
        }
    },
});

function getFileType(mimetype: string): string {
    if (mimetype === "application/pdf") return "pdf";
    if (mimetype === "text/csv") return "csv";
    if (mimetype === "application/json") return "json";
    if (mimetype === "text/plain") return "text";
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype.startsWith("audio/")) return "audio";
    if (mimetype.startsWith("video/")) return "video";
    return "other";
}

async function startServer() {
    // Connect to MongoDB first
    await connectDB();

    const app = express();

    // CORS configuration
    app.use(cors({
        origin: ["http://localhost:3000", "http://localhost:5173"],
        credentials: true,
    }));

    app.use(express.json());

    const server = new ApolloServer({
        typeDefs,
        resolvers,
    });

    await server.start();

    // GraphQL endpoint - cast to any to bypass type mismatch
    app.use("/graphql", expressMiddleware(server) as any);

    // File upload endpoint
    app.post("/upload", upload.array("files", 10), async (req: Request, res: Response): Promise<any> => {
        try {
            const files = req.files as Express.Multer.File[];
            if (!files || files.length === 0) {
                return res.status(400).json({ error: "No files uploaded" });
            }

            const uploadedFiles = [];

            for (const file of files) {
                // Determine if file has relational data (simple heuristic based on type)
                const hasRelationalData = file.mimetype === "text/csv" || file.mimetype === "application/json";
                const fileType = getFileType(file.mimetype);

                let extractedEntities: string[] = [];
                let contentSummary = "";

                // Handle CSV files with proper parsing
                if (fileType === "csv") {
                    try {
                        const { analyzeCSV, extractEntitiesFromCSV, generateCSVSummary } = await import("./utils/csvParser");
                        const analysis = analyzeCSV(file.path, 20);
                        extractedEntities = extractEntitiesFromCSV(analysis, file.originalname);
                        contentSummary = generateCSVSummary(analysis, file.originalname);
                        console.log(`CSV Analysis: ${analysis.rowCount} rows, ${analysis.columns.length} columns`);
                        console.log(`Extracted entities: ${extractedEntities.length}`);
                    } catch (e) {
                        console.warn("CSV parsing failed:", e);
                    }
                } else if (fileType === "json") {
                    // Handle JSON files
                    try {
                        const content = fs.readFileSync(file.path, "utf-8");
                        const jsonData = JSON.parse(content);
                        const keys = Array.isArray(jsonData) && jsonData.length > 0
                            ? Object.keys(jsonData[0])
                            : Object.keys(jsonData);
                        extractedEntities = keys.map(k => `Field: ${k}`);
                    } catch (e) {
                        console.warn("JSON parsing failed:", e);
                    }
                } else if (["pdf", "text"].includes(fileType)) {
                    // For text files, use Gemini for entity extraction
                    try {
                        const content = fs.readFileSync(file.path, "utf-8");
                        if (content.length > 0 && content.length < 50000) {
                            const entityResult = await GeminiService.analyzeComplex(
                                `Extract key entities from: ${content.substring(0, 5000)}`,
                                "Return a JSON array of entity names only"
                            );
                            if (Array.isArray(entityResult)) {
                                extractedEntities = entityResult;
                            }
                        }
                    } catch (e) {
                        console.warn("Entity extraction failed:", e);
                    }
                }

                // Save to MongoDB
                const fileDoc = await FileMetadata.create({
                    filename: file.filename,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    fileType,
                    hasRelationalData,
                    extractedEntities,
                });

                uploadedFiles.push({
                    id: fileDoc._id,
                    filename: file.originalname,
                    type: fileType,
                    hasRelationalData,
                    extractedEntities,
                });
            }

            res.json({
                success: true,
                files: uploadedFiles,
                message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
            });
        } catch (error) {
            console.error("Upload error:", error);
            res.status(500).json({ error: "Upload failed" });
        }
    });

    // Get all uploaded files metadata
    app.get("/files", async (_req: Request, res: Response) => {
        try {
            const files = await FileMetadata.find().sort({ createdAt: -1 }).limit(50);
            res.json({ files });
        } catch (error) {
            res.status(500).json({ error: "Failed to fetch files" });
        }
    });

    // Delete a file
    app.delete("/files/:id", async (req: Request, res: Response): Promise<any> => {
        try {
            const { id } = req.params;
            const file = await FileMetadata.findById(id);

            if (!file) {
                return res.status(404).json({ error: "File not found" });
            }

            // Delete from filesystem
            const filePath = path.join(uploadsDir, file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Delete from MongoDB
            await FileMetadata.findByIdAndDelete(id);

            res.json({ success: true, message: "File deleted" });
        } catch (error) {
            console.error("Delete error:", error);
            res.status(500).json({ error: "Failed to delete file" });
        }
    });

    // Get file visualization data with relations
    app.get("/visualization", async (_req: Request, res: Response) => {
        try {
            const files = await FileMetadata.find().sort({ createdAt: -1 });
            const graphCache = await GraphCache.findOne().sort({ createdAt: -1 });

            // Build nodes and links for visualization
            const nodes: any[] = [];
            const links: any[] = [];
            const nodeIds = new Set<string>();

            // Add file nodes
            files.forEach((file) => {
                const fileId = `file-${file._id}`;
                if (!nodeIds.has(fileId)) {
                    nodes.push({
                        id: fileId,
                        name: file.originalName,
                        type: "file",
                        fileType: file.fileType,
                        val: 12,
                    });
                    nodeIds.add(fileId);

                    // Add entity nodes from file metadata
                    file.extractedEntities?.forEach((entity) => {
                        const entityId = `entity-${entity.toLowerCase().replace(/\s+/g, "-")}`;

                        if (!nodeIds.has(entityId)) {
                            nodes.push({
                                id: entityId,
                                name: entity,
                                type: "entity",
                                val: 6,
                            });
                            nodeIds.add(entityId);
                        }

                        links.push({
                            source: fileId,
                            target: entityId,
                            label: "contains",
                        });
                    });
                }
            });

            // Add relations from GraphCache
            if (graphCache) {
                // Add cached entities
                graphCache.entities?.forEach((entity) => {
                    const entityId = `entity-${entity.name.toLowerCase().replace(/\s+/g, "-")}`;

                    if (!nodeIds.has(entityId)) {
                        nodes.push({
                            id: entityId,
                            name: entity.name,
                            type: entity.type || "entity",
                            val: 6,
                        });
                        nodeIds.add(entityId);
                    }
                });

                // Add cached relationships
                graphCache.relationships?.forEach((rel) => {
                    const fromId = `entity-${rel.from.toLowerCase().replace(/\s+/g, "-")}`;
                    const toId = `entity-${rel.to.toLowerCase().replace(/\s+/g, "-")}`;

                    // Ensure both nodes exist
                    if (!nodeIds.has(fromId)) {
                        nodes.push({ id: fromId, name: rel.from, type: "entity", val: 6 });
                        nodeIds.add(fromId);
                    }
                    if (!nodeIds.has(toId)) {
                        nodes.push({ id: toId, name: rel.to, type: "entity", val: 6 });
                        nodeIds.add(toId);
                    }

                    links.push({
                        source: fromId,
                        target: toId,
                        label: rel.type,
                    });
                });
            }

            res.json({ nodes, links });
        } catch (error) {
            console.error("Visualization error:", error);
            res.status(500).json({ error: "Failed to generate visualization" });
        }
    });

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
        console.log(`🚀 Server ready at: http://localhost:${PORT}/graphql`);
        console.log(`📁 File upload at: http://localhost:${PORT}/upload`);
    });
}

startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
