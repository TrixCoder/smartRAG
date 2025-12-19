import { IRAGStrategy, RAGResult } from "./types";
import { GeminiService } from "../gemini";
import { FileMetadata, GraphCache } from "../../db/models";

export class GraphRAGStrategy implements IRAGStrategy {
    async execute(query: string, context: any): Promise<RAGResult> {
        console.log("Executing GraphRAG Strategy...");

        // Get file data for analysis
        const files = await FileMetadata.find().sort({ createdAt: -1 }).limit(5);
        const fileContents = files.map(f => ({
            name: f.originalName,
            type: f.fileType,
            entities: f.extractedEntities || []
        }));

        // Extract relations using Gemini
        const systemPrompt = `You are a data analyst. Analyze the query and available data.
Return a CONCISE markdown response with:
1. **Key Entities** (bullet list)
2. **Relations** (table: Entity A | Relation | Entity B)
3. **Insights** (2-3 bullet points max)

Keep response under 200 words. Use markdown formatting.`;

        const answer = await GeminiService.generateFast(
            `Query: ${query}
Available Data: ${JSON.stringify(fileContents)}

Analyze and respond concisely in markdown.`,
            systemPrompt
        );

        // Extract relations for graph visualization
        try {
            const relationData = await GeminiService.analyzeComplex(
                `Extract entities and relationships from this context: ${JSON.stringify(fileContents)}
Return JSON: { "entities": [{"name": "...", "type": "..."}], "relationships": [{"from": "...", "to": "...", "type": "..."}] }`,
                "You are a knowledge graph extractor. Return only valid JSON."
            );

            // Save to graph cache if valid
            if (relationData && (relationData.entities || relationData.relationships)) {
                const existingCache = await GraphCache.findOne().sort({ createdAt: -1 });
                if (existingCache) {
                    existingCache.entities = [...(existingCache.entities || []), ...(relationData.entities || [])];
                    existingCache.relationships = [...(existingCache.relationships || []), ...(relationData.relationships || [])];
                    await existingCache.save();
                } else {
                    await GraphCache.create({
                        sessionId: files[0]?._id || null,
                        entities: relationData.entities || [],
                        relationships: relationData.relationships || []
                    });
                }
                console.log("Updated graph cache with new relations");
            }
        } catch (e) {
            console.warn("Failed to extract relations for graph:", e);
        }

        return {
            answer,
            sourceNodes: files.map(f => ({
                id: f._id.toString(),
                content: f.originalName,
                type: "File"
            })),
            reasoningTrace: "GraphRAG: Analyzed data → Extracted relations → Synthesized response",
        };
    }
}
