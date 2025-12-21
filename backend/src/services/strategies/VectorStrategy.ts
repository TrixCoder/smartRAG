import { IRAGStrategy, RAGResult } from "./types";
import { GeminiService } from "../gemini";
import { FileMetadata } from "../../db/models";

export class VectorRAGStrategy implements IRAGStrategy {
    async execute(query: string, context: any): Promise<RAGResult> {
        console.log("Executing VectorRAG Strategy...");

        const sessionId = context?.sessionId;
        const fileQuery = sessionId ? { sessionId } : {};
        const files = await FileMetadata.find(fileQuery).sort({ createdAt: -1 }).limit(10);

        if (files.length === 0) {
            return {
                answer: "No documents uploaded. Please upload files first.",
                sourceNodes: [],
                reasoningTrace: "VectorRAG: No files",
            };
        }

        // Get actual data
        const dataContext = files.map(f => {
            let sample: any[] = [];
            try { sample = f.sampleData ? JSON.parse(f.sampleData).slice(0, 5) : []; } catch { }
            return { name: f.originalName, summary: f.contentSummary || "", sample };
        });

        // STRICT brief prompt
        const systemPrompt = `You analyze uploaded data. Be EXTREMELY BRIEF.

DATA:
${JSON.stringify(dataContext[0], null, 2)}

RULES:
1. MAX 4 sentences total
2. Answer based ONLY on the data shown above
3. NO tutorials, NO definitions, NO generic explanations
4. If data doesn't answer the question, say "Not found in your data"`;

        const answer = await GeminiService.generateFast(
            query,
            systemPrompt
        );

        return {
            answer,
            sourceNodes: files.map(f => ({
                id: f._id.toString(),
                content: f.originalName,
                nodeType: "Document"
            })),
            reasoningTrace: `VectorRAG: Analyzed ${files.length} file(s)`,
        };
    }
}
