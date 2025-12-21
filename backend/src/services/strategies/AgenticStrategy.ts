import { IRAGStrategy, RAGResult } from "./types";
import { GeminiService } from "../gemini";
import { FileMetadata } from "../../db/models";

export class AgenticRAGStrategy implements IRAGStrategy {
    async execute(query: string, context: any): Promise<RAGResult> {
        console.log("Executing Agentic RAG Strategy...");

        const sessionId = context?.sessionId;
        const plan = context.plan || ["Analyze", "Execute", "Synthesize"];

        const fileQuery = sessionId ? { sessionId } : {};
        const files = await FileMetadata.find(fileQuery).sort({ createdAt: -1 }).limit(10);

        const dataContext = files.map(f => ({
            name: f.originalName,
            summary: f.contentSummary || "",
            entities: f.extractedEntities?.slice(0, 10) || []
        }));

        const systemPrompt = `You are an AI executing a task step-by-step.

RULES:
- Be CONCISE (max 5 sentences total)
- Show results, not methods
- Base answers on provided data ONLY

Plan: ${plan.join(" → ")}
Data: ${JSON.stringify(dataContext)}`;

        const answer = await GeminiService.generateFast(
            `Task: ${query}\nExecute and provide BRIEF results only.`,
            systemPrompt
        );

        return {
            answer,
            sourceNodes: files.map(f => ({
                id: f._id.toString(),
                content: f.originalName,
                type: "File"
            })),
            reasoningTrace: `Agentic: ${plan.join(" → ")} → Done`,
            executionPlan: plan,
        };
    }
}
