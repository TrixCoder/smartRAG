import { IRAGStrategy, RAGResult } from "./types";
import { GeminiService } from "../gemini";
import { FileMetadata, GraphCache } from "../../db/models";

export class GraphRAGStrategy implements IRAGStrategy {
    async execute(query: string, context: any): Promise<RAGResult> {
        console.log("Executing GraphRAG Strategy...");

        // Get sessionId from context if available
        const sessionId = context?.sessionId;

        // Get file data for this session
        const fileQuery = sessionId ? { sessionId } : {};
        const files = await FileMetadata.find(fileQuery).sort({ createdAt: -1 }).limit(10);

        if (files.length === 0) {
            return {
                answer: "No data uploaded yet. Please upload files to analyze relations.",
                sourceNodes: [],
                reasoningTrace: "GraphRAG: No files found in session",
            };
        }

        // Build data summary
        const dataInfo = files.map(f => ({
            name: f.originalName,
            type: f.fileType,
            columns: f.extractedEntities?.filter(e => e.startsWith("Column:")).map(e => e.replace("Column:", "").trim()) || [],
            values: f.extractedEntities?.filter(e => !e.startsWith("Column:") && !e.startsWith("Field:")).slice(0, 20) || [],
            summary: f.contentSummary || "",
            sample: f.sampleData ? JSON.parse(f.sampleData).slice(0, 3) : []
        }));

        // CONCISE system prompt - enforces direct answers
        const systemPrompt = `You are a DATA ANALYST. Be DIRECT and CONCISE.

RULES:
- Answer in 3-5 sentences MAX
- DO NOT explain methods or theory
- DO NOT give generic advice
- ONLY describe what's in the ACTUAL DATA provided
- If asked about relations, list them as: "A → relates to → B"

Available data: ${JSON.stringify(dataInfo, null, 2)}`;

        const answer = await GeminiService.generateFast(
            query,
            systemPrompt
        );

        // Extract and store relations
        try {
            const relationData = await GeminiService.analyzeComplex(
                `From this data, extract entity relationships:
${JSON.stringify(dataInfo)}

Return JSON only:
{"entities": [{"name": "...", "type": "column|value|category"}], "relationships": [{"from": "...", "to": "...", "type": "has_value|belongs_to|relates_to"}]}`,
                "You are a knowledge graph extractor. Return ONLY valid JSON, nothing else."
            );

            if (relationData && (relationData.entities || relationData.relationships)) {
                // Store per session
                if (sessionId) {
                    const existingCache = await GraphCache.findOne({ sessionId });
                    if (existingCache) {
                        // Merge without duplicates
                        const existingEntityNames = new Set(existingCache.entities?.map(e => e.name) || []);
                        const newEntities = (relationData.entities || []).filter((e: any) => !existingEntityNames.has(e.name));
                        existingCache.entities = [...(existingCache.entities || []), ...newEntities];
                        existingCache.relationships = [...(existingCache.relationships || []), ...(relationData.relationships || [])];
                        await existingCache.save();
                    } else {
                        await GraphCache.create({
                            sessionId,
                            entities: relationData.entities || [],
                            relationships: relationData.relationships || []
                        });
                    }
                    console.log("Stored graph cache for session:", sessionId);
                }
            }
        } catch (e) {
            console.warn("Failed to extract relations:", e);
        }

        return {
            answer,
            sourceNodes: files.map(f => ({
                id: f._id.toString(),
                content: f.originalName,
                type: "File"
            })),
            reasoningTrace: `GraphRAG: Analyzed ${files.length} file(s) → Found relations → Generated response`,
        };
    }
}
