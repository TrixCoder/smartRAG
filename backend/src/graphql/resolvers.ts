import { RAGRouterService } from "../services/ragRouter";
import { GeminiService } from "../services/gemini";
import { sanitizeUserQuery } from "../middleware/security";

const routerService = new RAGRouterService();

export const resolvers = {
    Query: {
        healthCheck: () => "OK",
    },
    Mutation: {
        queryRAG: async (_: any, { userInput, complexity }: { userInput: string; complexity?: string }) => {
            console.log("Received Query:", userInput?.substring(0, 100));

            // Security: Validate and sanitize user input
            const { safe, sanitized, warning } = sanitizeUserQuery(userInput || "");

            if (!safe) {
                console.warn("Blocked query due to security:", warning);
                return {
                    answer: "Your query could not be processed. Please rephrase your question.",
                    strategyUsed: "Blocked",
                    reasoningTrace: "Query blocked by security filter",
                    sourceNodes: [],
                    executionPlan: []
                };
            }

            if (!sanitized || sanitized.trim().length === 0) {
                return {
                    answer: "Please provide a valid question.",
                    strategyUsed: "Error",
                    reasoningTrace: "Empty query",
                    sourceNodes: [],
                    executionPlan: []
                };
            }

            try {
                const fileMetadata = {
                    hasRelationalData: complexity === "high",
                    fileTypes: ["pdf", "csv"]
                };

                const result = await routerService.routeAndExecute(sanitized, fileMetadata);
                return result;
            } catch (error: any) {
                console.error("Error in queryRAG:", error?.message || error);

                // Fallback: Generate a simple response without routing
                try {
                    console.log("Falling back to direct response...");
                    const answer = await GeminiService.generateFast(
                        `Answer this question: ${sanitized}`,
                        "You are a helpful AI assistant."
                    );

                    return {
                        answer,
                        strategyUsed: "Direct",
                        reasoningTrace: "Used fallback direct generation due to routing error.",
                        sourceNodes: [],
                        executionPlan: []
                    };
                } catch (fallbackError: any) {
                    console.error("Fallback also failed:", fallbackError?.message || fallbackError);

                    return {
                        answer: "I apologize, but I'm having trouble processing your request right now. Please try again later.",
                        strategyUsed: "Error",
                        reasoningTrace: `Error: ${error?.message || "Unknown error"}`,
                        sourceNodes: [],
                        executionPlan: []
                    };
                }
            }
        },
        uploadFile: async (_: any, { filename }: { filename: string }) => {
            console.log("Mock Upload:", filename);
            return true;
        }
    },
};
