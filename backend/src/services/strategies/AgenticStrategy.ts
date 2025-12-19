import { IRAGStrategy, RAGResult } from "./types";
import { GeminiService } from "../gemini";

export class AgenticRAGStrategy implements IRAGStrategy {
    async execute(query: string, context: any): Promise<RAGResult> {
        console.log("Executing Agentic RAG Strategy...");
        const plan = context.plan || ["Analyze", "Execute", "Synthesize"];

        // Concise multi-step execution
        const systemPrompt = `You are an AI agent executing a multi-step plan.
Execution Plan: ${plan.join(" → ")}

Format response:
## Steps Completed
- Step 1: [brief result]
- Step 2: [brief result]

## Final Answer
[Concise answer in 2-3 sentences]

Keep total response under 200 words.`;

        const answer = await GeminiService.generateFast(
            `Task: ${query}
Execute the plan and provide results.`,
            systemPrompt
        );

        return {
            answer,
            sourceNodes: [],
            reasoningTrace: `Agentic: ${plan.join(" → ")} → Complete`,
            executionPlan: plan,
        };
    }
}
