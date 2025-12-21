import { IRAGStrategy, RAGResult } from "./types";
import { GeminiService } from "../gemini";
import { FileMetadata } from "../../db/models";

export class VectorRAGStrategy implements IRAGStrategy {
    async execute(query: string, context: any): Promise<RAGResult> {
        console.log("Executing Advanced/Vector RAG Strategy...");

        const sessionId = context?.sessionId;
        const fileQuery = sessionId ? { sessionId } : {};
        const files = await FileMetadata.find(fileQuery).sort({ createdAt: -1 }).limit(10);

        if (files.length === 0) {
            return {
                answer: "No documents uploaded. Please upload files to analyze.",
                sourceNodes: [],
                reasoningTrace: "VectorRAG: No files in session",
            };
        }

        // Build context from file data
        const dataContext = files.map(f => ({
            name: f.originalName,
            summary: f.contentSummary || "",
            sample: f.sampleData ? JSON.parse(f.sampleData).slice(0, 5) : []
        }));

        const systemPrompt = `You are a DATA ANALYST. Be DIRECT and CONCISE.

RULES:
- Answer in 3-5 sentences MAX
- Use bullet points for lists
- Base answers ONLY on the provided data
- DO NOT give generic explanations or methods
- If no relevant data exists, say so briefly

Data available:
${JSON.stringify(dataContext, null, 2)}`;

        const answer = await GeminiService.generateFast(query, systemPrompt);

        return {
            answer,
            sourceNodes: files.map(f => ({
                id: f._id.toString(),
                content: f.originalName,
                type: "Document"
            })),
            reasoningTrace: `VectorRAG: Retrieved ${files.length} file(s) → Synthesized concise response`,
        };
    }
}
