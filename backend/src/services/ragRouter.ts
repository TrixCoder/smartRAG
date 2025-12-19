import { GeminiService } from "./gemini";
import { GraphRAGStrategy } from "./strategies/GraphStrategy";
import { VectorRAGStrategy } from "./strategies/VectorStrategy";
import { AgenticRAGStrategy } from "./strategies/AgenticStrategy";
import { RAGResult } from "./strategies/types";

export class RAGRouterService {
    private strategies = {
        GraphRAG: new GraphRAGStrategy(),
        Advanced: new VectorRAGStrategy(),
        Agentic: new AgenticRAGStrategy(),
        MultiModal: new VectorRAGStrategy(), // Fallback/Same for now
    };

    /**
     * The Main Entry Point.
     * 1. Calls Gemini Judge to decide strategy.
     * 2. Executes the chosen strategy.
     * 3. Returns combined result.
     */
    async routeAndExecute(query: string, fileMetadata: any = {}): Promise<RAGResult & { strategyUsed: string }> {
        console.log(`Routing query: "${query}"`);

        // 1. The Judge
        const decision = await GeminiService.routeQuery(query, fileMetadata);
        console.log("Judge Decision:", decision);

        const strategyKey = decision.strategy as keyof typeof this.strategies;
        const strategy = this.strategies[strategyKey] || this.strategies.Advanced;

        // 2. Execution
        const result = await strategy.execute(query, { ...fileMetadata, plan: decision.plan });

        // 3. Return
        return {
            ...result,
            strategyUsed: decision.strategy,
            reasoningTrace: `[ROUTER] Decision: ${decision.strategy} because "${decision.reasoning}"\n` + result.reasoningTrace,
            executionPlan: decision.plan
        };
    }
}
