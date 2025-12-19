import { RAGRouterService } from "../services/ragRouter";
import { GeminiService } from "../services/gemini";

const routerService = new RAGRouterService();

export const resolvers = {
    Query: {
        healthCheck: () => "OK",
    },
    Mutation: {
        queryRAG: async (_: any, { userInput, complexity }: { userInput: string; complexity?: string }) => {
            console.log("Received Query:", userInput);

            try {
                // Mock file metadata for now
                const fileMetadata = {
                    hasRelationalData: complexity === "high",
                    fileTypes: ["pdf", "csv"]
                };

                const result = await routerService.routeAndExecute(userInput, fileMetadata);
                return result;
            } catch (error: any) {
                console.error("Error in queryRAG:", error?.message || error);

                // Fallback: Generate a simple response without routing
                try {
                    console.log("Falling back to direct Gemini response...");
                    const answer = await GeminiService.generateFast(
                        `Answer this question: ${userInput}`,
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

                    // Return a graceful error response instead of throwing
                    return {
                        answer: "I apologize, but I'm having trouble processing your request right now. Please check that your API key is configured correctly.",
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
