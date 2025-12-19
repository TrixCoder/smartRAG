import { RAGRouterService } from "../services/ragRouter";

const routerService = new RAGRouterService();

export const resolvers = {
    Query: {
        healthCheck: () => "OK",
    },
    Mutation: {
        queryRAG: async (_: any, { userInput, complexity }: { userInput: string; complexity?: string }) => {
            try {
                console.log("Received Query:", userInput);
                // Mock file metadata for now
                const fileMetadata = {
                    hasRelationalData: complexity === "high",
                    fileTypes: ["pdf", "csv"]
                };

                const result = await routerService.routeAndExecute(userInput, fileMetadata);
                return result;
            } catch (error) {
                console.error("Error in queryRAG:", error);
                throw new Error("Failed to process RAG query.");
            }
        },
        uploadFile: async (_: any, { filename }: { filename: string }) => {
            console.log("Mock Upload:", filename);
            return true;
        }
    },
};
