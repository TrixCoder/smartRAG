import { RAGRouterService } from "../services/ragRouter";
import { GeminiService } from "../services/gemini";
import { ChatSession, ChatMessage, FileMetadata } from "../db";
import { sanitizeUserQuery } from "../middleware/security";
import mongoose from "mongoose";

const routerService = new RAGRouterService();

export const resolvers = {
    Query: {
        healthCheck: () => "OK",

        // Get all sessions
        getSessions: async () => {
            const sessions = await ChatSession.find()
                .sort({ updatedAt: -1 })
                .limit(50);

            const sessionsWithCount = await Promise.all(
                sessions.map(async (session) => {
                    const messageCount = await ChatMessage.countDocuments({ sessionId: session._id });
                    return {
                        id: session._id.toString(),
                        title: session.title,
                        createdAt: session.createdAt.toISOString(),
                        updatedAt: session.updatedAt.toISOString(),
                        messageCount,
                    };
                })
            );

            return sessionsWithCount;
        },

        // Get single session with messages
        getSession: async (_: any, { sessionId }: { sessionId: string }) => {
            const session = await ChatSession.findById(sessionId);
            if (!session) return null;

            const messages = await ChatMessage.find({ sessionId: session._id })
                .sort({ createdAt: 1 });

            return {
                session: {
                    id: session._id.toString(),
                    title: session.title,
                    createdAt: session.createdAt.toISOString(),
                    updatedAt: session.updatedAt.toISOString(),
                },
                messages: messages.map(msg => ({
                    id: msg._id.toString(),
                    role: msg.role,
                    content: msg.content,
                    strategy: msg.strategy,
                    reasoningTrace: msg.reasoningTrace,
                    createdAt: msg.createdAt.toISOString(),
                })),
            };
        },

        // Get files for a session
        getSessionFiles: async (_: any, { sessionId }: { sessionId: string }) => {
            const files = await FileMetadata.find({ sessionId })
                .sort({ createdAt: -1 });

            return files.map(file => ({
                id: file._id.toString(),
                originalName: file.originalName,
                fileType: file.fileType,
                hasRelationalData: file.hasRelationalData,
                extractedEntities: file.extractedEntities || [],
                createdAt: file.createdAt.toISOString(),
            }));
        },
    },

    Mutation: {
        // Create new session
        createSession: async (_: any, { title }: { title?: string }) => {
            const session = await ChatSession.create({
                title: title || "New Chat",
            });

            return {
                id: session._id.toString(),
                title: session.title,
                createdAt: session.createdAt.toISOString(),
                updatedAt: session.updatedAt.toISOString(),
                messageCount: 0,
            };
        },

        // Delete session and all associated data
        deleteSession: async (_: any, { sessionId }: { sessionId: string }) => {
            const objectId = new mongoose.Types.ObjectId(sessionId);

            // Delete all associated data
            await Promise.all([
                ChatMessage.deleteMany({ sessionId: objectId }),
                FileMetadata.deleteMany({ sessionId: objectId }),
                ChatSession.findByIdAndDelete(objectId),
            ]);

            return true;
        },

        // Update session title
        updateSessionTitle: async (_: any, { sessionId, title }: { sessionId: string; title: string }) => {
            const session = await ChatSession.findByIdAndUpdate(
                sessionId,
                { title },
                { new: true }
            );

            if (!session) return null;

            return {
                id: session._id.toString(),
                title: session.title,
                createdAt: session.createdAt.toISOString(),
                updatedAt: session.updatedAt.toISOString(),
            };
        },

        // Query RAG with session context
        queryRAG: async (_: any, { sessionId, userInput, complexity }: { sessionId: string; userInput: string; complexity?: string }) => {
            console.log("Received Query for session:", sessionId, "Query:", userInput?.substring(0, 100));

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

            // Validate session exists
            let session = await ChatSession.findById(sessionId);
            if (!session) {
                // Create session if it doesn't exist
                session = await ChatSession.create({ _id: sessionId, title: "New Chat" });
            }

            const sessionObjectId = new mongoose.Types.ObjectId(sessionId);

            // Save user message
            await ChatMessage.create({
                sessionId: sessionObjectId,
                role: "user",
                content: sanitized,
            });

            try {
                // Get session's file metadata
                const files = await FileMetadata.find({ sessionId: sessionObjectId });
                const fileMetadata = {
                    sessionId: sessionId, // Pass sessionId to strategies
                    hasRelationalData: files.some(f => f.hasRelationalData) || complexity === "high",
                    fileTypes: files.map(f => f.fileType),
                    files: files.map(f => ({
                        name: f.originalName,
                        type: f.fileType,
                        entities: f.extractedEntities || [],
                        summary: f.contentSummary || "",
                    })),
                };

                const result = await routerService.routeAndExecute(sanitized, fileMetadata);

                // Save assistant message
                await ChatMessage.create({
                    sessionId: sessionObjectId,
                    role: "assistant",
                    content: result.answer,
                    strategy: result.strategyUsed,
                    reasoningTrace: result.reasoningTrace,
                    executionPlan: result.executionPlan,
                    sourceNodes: result.sourceNodes,
                });

                // Update session title if first message
                const messageCount = await ChatMessage.countDocuments({ sessionId: sessionObjectId });
                if (messageCount <= 2) {
                    // Auto-generate title from first message
                    const shortTitle = sanitized.substring(0, 50) + (sanitized.length > 50 ? "..." : "");
                    await ChatSession.findByIdAndUpdate(sessionId, { title: shortTitle });
                }

                return {
                    ...result,
                    sourceNodes: result.sourceNodes.map(node => ({
                        ...node,
                        type: node.nodeType // Map backend nodeType to GraphQL schema type
                    }))
                };
            } catch (error: any) {
                console.error("Error in queryRAG:", error?.message || error);

                // Fallback: Generate a simple response without routing
                try {
                    console.log("Falling back to direct response...");
                    const answer = await GeminiService.generateFast(
                        `Answer this question: ${sanitized}`,
                        "You are a helpful AI assistant."
                    );

                    // Save fallback response
                    await ChatMessage.create({
                        sessionId: sessionObjectId,
                        role: "assistant",
                        content: answer,
                        strategy: "Direct",
                    });

                    return {
                        answer,
                        strategyUsed: "Direct",
                        reasoningTrace: "Used fallback direct generation due to routing error.",
                        sourceNodes: [],
                        executionPlan: []
                    };
                } catch (fallbackError: any) {
                    console.error("Fallback also failed:", fallbackError?.message || fallbackError);

                    const errorMessage = "I apologize, but I'm having trouble processing your request right now. Please try again later.";

                    await ChatMessage.create({
                        sessionId: sessionObjectId,
                        role: "assistant",
                        content: errorMessage,
                        strategy: "Error",
                    });

                    return {
                        answer: errorMessage,
                        strategyUsed: "Error",
                        reasoningTrace: `Error: ${error?.message || "Unknown error"}`,
                        sourceNodes: [],
                        executionPlan: []
                    };
                }
            }
        },
    },
};
