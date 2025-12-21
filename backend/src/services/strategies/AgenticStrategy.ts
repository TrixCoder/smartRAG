import { IRAGStrategy, RAGResult } from "./types";
import { GeminiService } from "../gemini";
import { FileMetadata } from "../../db/models";

export class AgenticRAGStrategy implements IRAGStrategy {
    async execute(query: string, context: any): Promise<RAGResult> {
        console.log("Executing AgenticRAG Strategy...");

        const sessionId = context?.sessionId;
        const plan = context.plan || ["Analyze", "Execute", "Answer"];

        const fileQuery = sessionId ? { sessionId } : {};
        const files = await FileMetadata.find(fileQuery).sort({ createdAt: -1 }).limit(10);

        const dataContext = files.map(f => {
            let sample: any[] = [];
            try { sample = f.sampleData ? JSON.parse(f.sampleData).slice(0, 3) : []; } catch { }
            return { name: f.originalName, columns: f.extractedEntities?.slice(0, 10) || [], sample };
        });

        // UPDATED PROMPT: Concise but Explanatory
        const systemPrompt = `Execute this task on the uploaded data.

DATA: ${JSON.stringify(dataContext[0] || {}, null, 2)}

RULES:
1. Synthesize the findings.
2. Be CONCISE but EXPLANATORY (Max 3 paragraphs).
3. Explain your reasoning briefly.
4. Focus on insights rather than just raw data.`;

        const answer = await GeminiService.generateFast(
            `Task: ${query}`,
            systemPrompt
        );

        return {
            answer,
            sourceNodes: files.map(f => ({
                id: f._id.toString(),
                content: f.originalName,
                nodeType: "File"
            })),
            reasoningTrace: `Agentic: ${plan.join(" → ")}`,
            executionPlan: plan,
        };
    }
}
