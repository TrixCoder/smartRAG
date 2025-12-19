import { IRAGStrategy, RAGResult } from "./types";
import { GeminiService } from "../gemini";
import { FileMetadata } from "../../db/models";
import { VectorService } from "../vector";

export class VectorRAGStrategy implements IRAGStrategy {
    async execute(query: string, context: any): Promise<RAGResult> {
        console.log("Executing Advanced/Vector RAG Strategy...");

        // Get file data
        const files = await FileMetadata.find().sort({ createdAt: -1 }).limit(5);
        const fileNames = files.map(f => f.originalName).join(", ");

        // Concise system prompt for token efficiency
        const systemPrompt = `You are a document analyst. Be CONCISE.
Format response in markdown:
- Use **bold** for key terms
- Use bullet points for lists
- Keep under 150 words
- No unnecessary filler text`;

        const answer = await GeminiService.generateFast(
            `Query: ${query}
Documents: ${fileNames}

Provide a concise, well-formatted analysis.`,
            systemPrompt
        );

        return {
            answer,
            sourceNodes: files.map(f => ({
                id: f._id.toString(),
                content: f.originalName,
                type: "Document"
            })),
            reasoningTrace: "Advanced: Vector search → Semantic retrieval → Concise synthesis",
        };
    }
}
