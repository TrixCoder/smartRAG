import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { typeDefs } from "./graphql/schema";
import { resolvers } from "./graphql/resolvers";
import { connectDB, FileMetadata } from "./db";
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

                // Read file content for text-based files
                let content = "";
                if (["pdf", "csv", "json", "text"].includes(fileType)) {
                    try {
                        content = fs.readFileSync(file.path, "utf-8");
                    } catch (e) {
                        console.warn("Could not read file content:", e);
                    }
                }

                // Extract entities using Gemini (for text content)
                let extractedEntities: string[] = [];
                if (content && content.length > 0 && content.length < 50000) {
                    try {
                        const entityResult = await GeminiService.analyzeComplex(
                            `Extract key entities (companies, people, products, locations) from this text. Return as JSON array of strings.\n\nText: ${content.substring(0, 5000)}`,
                            "You are an entity extraction expert. Return ONLY a JSON array of entity names."
                        );
                        if (Array.isArray(entityResult)) {
                            extractedEntities = entityResult;
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

    // Get file visualization data
    app.get("/visualization", async (_req: Request, res: Response) => {
        try {
            const files = await FileMetadata.find().sort({ createdAt: -1 });

            // Build nodes and links for visualization
            const nodes: any[] = [];
            const links: any[] = [];

            files.forEach((file) => {
                // Add file node
                nodes.push({
                    id: `file-${file._id}`,
                    name: file.originalName,
                    type: "file",
                    fileType: file.fileType,
                    val: 10,
                });

                // Add entity nodes and links
                file.extractedEntities?.forEach((entity) => {
                    const entityId = `entity-${entity.toLowerCase().replace(/\s+/g, "-")}`;

                    // Check if entity node already exists
                    if (!nodes.find(n => n.id === entityId)) {
                        nodes.push({
                            id: entityId,
                            name: entity,
                            type: "entity",
                            val: 5,
                        });
                    }

                    // Link file to entity
                    links.push({
                        source: `file-${file._id}`,
                        target: entityId,
                    });
                });
            });

            res.json({ nodes, links });
        } catch (error) {
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
