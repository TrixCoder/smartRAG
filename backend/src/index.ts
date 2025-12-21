import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { typeDefs } from "./graphql/schema";
import { resolvers } from "./graphql/resolvers";
import { connectDB, FileMetadata, GraphCache } from "./db";
import { Neo4jService } from "./services/neo4j";
import {
    validateRequestBody,
    validateGraphQLQuery,
    validateFileUpload,
    sanitizeUserQuery
} from "./middleware/security";
import dotenv from "dotenv";

dotenv.config();

// Configure multer for memory storage (no filesystem)
const upload = multer({
    storage: multer.memoryStorage(),
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

function getFileType(mimeType: string): string {
    const typeMap: Record<string, string> = {
        "application/pdf": "pdf",
        "text/csv": "csv",
        "application/json": "json",
        "text/plain": "text",
        "image/png": "image",
        "image/jpeg": "image",
        "image/webp": "image",
    };
    return typeMap[mimeType] || "other";
}

async function startServer() {
    // Connect to databases
    await connectDB();
    await Neo4jService.connect();

    const app = express();

    // Security: HTTP headers
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "blob:"],
            },
        },
        crossOriginEmbedderPolicy: false,
    }));

    // Security: Rate limiting
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // 100 requests per window
        message: { error: "Too many requests, please try again later" },
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use(limiter);

    // Stricter rate limit for uploads
    const uploadLimiter = rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 10, // 10 uploads per minute
        message: { error: "Too many uploads, please try again later" },
    });

    app.use(cors({
        origin: ["http://localhost:3000", "http://localhost:5173"],
        credentials: true
    }));

    app.use(express.json({ limit: "1mb" }));

    // Security: Validate all request bodies
    app.use(validateRequestBody);

    const server = new ApolloServer({
        typeDefs,
        resolvers,
    });

    await server.start();

    // GraphQL endpoint with query validation
    app.use("/graphql", validateGraphQLQuery, expressMiddleware(server) as any);

    // File upload endpoint - stores in MongoDB, not filesystem
    app.post("/upload", upload.array("files", 10), async (req: Request, res: Response): Promise<any> => {
        try {
            const files = req.files as Express.Multer.File[];
            if (!files || files.length === 0) {
                return res.status(400).json({ error: "No files uploaded" });
            }

            // Get sessionId from request body (sent as form field)
            const sessionId = req.body.sessionId;
            if (!sessionId) {
                return res.status(400).json({ error: "sessionId is required" });
            }

            const uploadedFiles = [];

            for (const file of files) {
                const hasRelationalData = file.mimetype === "text/csv" || file.mimetype === "application/json";
                const fileType = getFileType(file.mimetype);
                const content = file.buffer.toString("utf-8");

                let extractedEntities: string[] = [];
                let dataSchema: any = null;
                let sampleData = "";
                let contentSummary = "";

                // Handle CSV files
                if (fileType === "csv") {
                    try {
                        const { parse } = await import("csv-parse/sync");
                        const records = parse(content, {
                            columns: true,
                            skip_empty_lines: true,
                            relax_column_count: true,
                        });

                        if (records.length > 0) {
                            const columns = Object.keys(records[0]);
                            const sampleRows = records.slice(0, 10);

                            // Build schema stats
                            const stats: Record<string, any> = {};
                            columns.forEach(col => {
                                const values = records.map((r: any) => r[col]).filter((v: any) => v);
                                const uniqueValues = [...new Set(values)];
                                const numericValues = values.filter((v: any) => !isNaN(parseFloat(v)));

                                if (numericValues.length > values.length * 0.8) {
                                    const nums = numericValues.map((v: any) => parseFloat(v));
                                    stats[col] = { type: "numeric", min: Math.min(...nums), max: Math.max(...nums), uniqueCount: uniqueValues.length };
                                } else {
                                    stats[col] = { type: "categorical", uniqueCount: uniqueValues.length };
                                }
                            });

                            dataSchema = { columns, rowCount: records.length, stats };
                            sampleData = JSON.stringify(sampleRows);

                            // Extract entities
                            extractedEntities = [...columns.map(c => `Column: ${c}`)];

                            // Get unique categorical values
                            const categoricalCols = ["category", "brand", "type", "status", "segment"];
                            columns.forEach(col => {
                                if (categoricalCols.some(c => col.toLowerCase().includes(c))) {
                                    const uniqueVals = [...new Set(records.map((r: any) => r[col]))].filter(v => v).slice(0, 10);
                                    extractedEntities.push(...(uniqueVals as string[]));
                                }
                            });

                            contentSummary = `CSV: ${records.length} rows, Columns: ${columns.join(", ")}`;
                            console.log(`CSV: ${records.length} rows, ${columns.length} columns`);
                        }
                    } catch (e) {
                        console.warn("CSV parsing failed:", e);
                    }
                } else if (fileType === "json") {
                    try {
                        const jsonData = JSON.parse(content);
                        const keys = Array.isArray(jsonData) && jsonData.length > 0
                            ? Object.keys(jsonData[0])
                            : Object.keys(jsonData);
                        extractedEntities = keys.map(k => `Field: ${k}`);
                        sampleData = JSON.stringify(Array.isArray(jsonData) ? jsonData.slice(0, 10) : jsonData).substring(0, 5000);
                        contentSummary = `JSON: ${keys.length} fields`;
                    } catch (e) {
                        console.warn("JSON parsing failed:", e);
                    }
                } else if (fileType === "text") {
                    contentSummary = content.substring(0, 1000);
                    sampleData = content.substring(0, 5000);
                }

                // Save to MongoDB with sessionId
                const fileDoc = await FileMetadata.create({
                    sessionId,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    fileType,
                    hasRelationalData,
                    extractedEntities: [...new Set(extractedEntities)].slice(0, 50),
                    dataSchema,
                    sampleData,
                    contentSummary,
                });

                // Save entities to Neo4j if connected
                if (Neo4jService.isConnected() && extractedEntities.length > 0) {
                    try {
                        const entities = extractedEntities.slice(0, 30).map(e => ({
                            name: e,
                            type: e.startsWith("Column:") ? "Column" : e.startsWith("Field:") ? "Field" : "Value"
                        }));
                        const created = await Neo4jService.createEntities(entities);
                        console.log(`Created ${created} entities in Neo4j`);
                    } catch (e) {
                        console.warn("Neo4j entity creation failed:", e);
                    }
                }

                uploadedFiles.push({
                    id: fileDoc._id,
                    filename: file.originalname,
                    type: fileType,
                    hasRelationalData,
                    extractedEntities: fileDoc.extractedEntities,
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
            const file = await FileMetadata.findByIdAndDelete(id);

            if (!file) {
                return res.status(404).json({ error: "File not found" });
            }

            res.json({ success: true, message: "File deleted" });
        } catch (error) {
            console.error("Delete error:", error);
            res.status(500).json({ error: "Failed to delete file" });
        }
    });

    // Get visualization data - filtered by session
    app.get("/visualization", async (req: Request, res: Response) => {
        try {
            const sessionId = req.query.sessionId as string;

            // Filter by session if provided
            const fileQuery = sessionId ? { sessionId } : {};
            const files = await FileMetadata.find(fileQuery).sort({ createdAt: -1 });
            const graphCache = sessionId
                ? await GraphCache.findOne({ sessionId }).sort({ createdAt: -1 })
                : await GraphCache.findOne().sort({ createdAt: -1 });

            const nodesMap = new Map<string, any>();
            const links: any[] = [];
            const linkSet = new Set<string>(); // Prevent duplicate links

            // Helper to normalize entity ID
            const normalizeId = (name: string) => `entity-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

            // Helper to add link without duplicates
            const addLink = (source: string, target: string, label: string) => {
                const key = `${source}->${target}`;
                if (!linkSet.has(key) && source !== target) {
                    links.push({ source, target, label });
                    linkSet.add(key);
                }
            };

            // Process each file
            files.forEach((file) => {
                const fileId = `file-${file._id}`;

                // Add file node
                nodesMap.set(fileId, {
                    id: fileId,
                    name: file.originalName,
                    type: "file",
                    fileType: file.fileType,
                    val: 15,
                });

                // Separate columns and values
                const columns: string[] = [];
                const values: string[] = [];

                file.extractedEntities?.forEach((entity) => {
                    if (entity.startsWith("Column:")) {
                        columns.push(entity.replace("Column:", "").trim());
                    } else if (entity.startsWith("Field:")) {
                        columns.push(entity.replace("Field:", "").trim());
                    } else {
                        values.push(entity);
                    }
                });

                // Add column nodes
                columns.forEach((col) => {
                    const colId = normalizeId(`col-${col}`);
                    if (!nodesMap.has(colId)) {
                        nodesMap.set(colId, {
                            id: colId,
                            name: col,
                            type: "entity", // Normalized to entity for frontend
                            category: "column",
                            val: 8,
                        });
                    }
                    addLink(fileId, colId, "has_column");
                });

                // Add value nodes and link to relevant columns
                values.forEach((val) => {
                    const valId = normalizeId(val);
                    if (!nodesMap.has(valId)) {
                        nodesMap.set(valId, {
                            id: valId,
                            name: val,
                            type: "entity",
                            category: "value",
                            val: 6,
                        });
                    }

                    // Link values to their file
                    addLink(fileId, valId, "contains");

                    // Infer relationships: values likely belong to category/brand columns
                    const categoryCol = columns.find(c => c.toLowerCase() === "category");
                    const brandCol = columns.find(c => c.toLowerCase() === "brand");

                    if (categoryCol && ["Books", "Beauty", "Toys", "Electronics", "Clothing", "Home"].includes(val)) {
                        addLink(normalizeId(`col-${categoryCol}`), valId, "has_value");
                    }
                    if (brandCol && val.startsWith("Brand")) {
                        addLink(normalizeId(`col-${brandCol}`), valId, "has_value");
                    }
                });
            });

            // Add relationships from GraphCache (AI-extracted)
            if (graphCache) {
                graphCache.entities?.forEach((entity) => {
                    const entityId = normalizeId(entity.name);
                    if (!nodesMap.has(entityId)) {
                        nodesMap.set(entityId, {
                            id: entityId,
                            name: entity.name,
                            type: "entity",
                            category: entity.type || "entity",
                            val: 6,
                        });
                    }
                });

                graphCache.relationships?.forEach((rel) => {
                    const fromId = normalizeId(rel.from);
                    const toId = normalizeId(rel.to);

                    // Ensure nodes exist
                    if (!nodesMap.has(fromId)) {
                        nodesMap.set(fromId, { id: fromId, name: rel.from, type: "entity", val: 6 });
                    }
                    if (!nodesMap.has(toId)) {
                        nodesMap.set(toId, { id: toId, name: rel.to, type: "entity", val: 6 });
                    }

                    addLink(fromId, toId, rel.type);
                });
            }

            const nodes = Array.from(nodesMap.values());
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

    // Cleanup on exit
    process.on("SIGINT", async () => {
        await Neo4jService.close();
        process.exit(0);
    });
}

startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
