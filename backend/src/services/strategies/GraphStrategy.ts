import { IRAGStrategy, RAGResult } from "./types";
import { GeminiService } from "../gemini";
import { FileMetadata, GraphCache } from "../../db/models";
import mongoose from "mongoose";

export class GraphRAGStrategy implements IRAGStrategy {
    async execute(query: string, context: any): Promise<RAGResult> {
        console.log("Executing GraphRAG Strategy...");

        const sessionId = context?.sessionId;
        const fileQuery = sessionId ? { sessionId } : {};
        const files = await FileMetadata.find(fileQuery).sort({ createdAt: -1 }).limit(10);

        if (files.length === 0) {
            return {
                answer: "No data uploaded yet. Please upload files to analyze relations.",
                sourceNodes: [],
                reasoningTrace: "GraphRAG: No files found",
            };
        }

        // Get actual data from files
        const dataInfo = files.map(f => {
            const columns = f.extractedEntities?.filter(e => e.startsWith("Column:")).map(e => e.replace("Column:", "").trim()) || [];
            const values = f.extractedEntities?.filter(e => !e.startsWith("Column:") && !e.startsWith("Field:")) || [];
            let sample: any[] = [];
            try {
                sample = f.sampleData ? JSON.parse(f.sampleData).slice(0, 5) : [];
            } catch { }
            return { name: f.originalName, columns, values, sample, summary: f.contentSummary || "" };
        });

        // Build relations from actual data
        const relations: string[] = [];
        dataInfo.forEach(file => {
            file.columns.forEach(col => {
                const colValues = file.sample.map((row: any) => row[col]).filter((v: any) => v);
                const uniqueVals = [...new Set(colValues)].slice(0, 5);
                if (uniqueVals.length > 0 && uniqueVals.length <= 10) {
                    uniqueVals.forEach(val => relations.push(`${col} → contains → ${val}`));
                }
            });
        });

        // VERY STRICT concise prompt
        const systemPrompt = `You analyze data. Be EXTREMELY BRIEF.

DATA IN YOUR SESSION:
- File: ${dataInfo[0]?.name || "unknown"}
- Columns: ${dataInfo[0]?.columns.join(", ") || "none"}
- Sample values: ${JSON.stringify(dataInfo[0]?.sample.slice(0, 2)) || "none"}

RULES - FOLLOW EXACTLY:
1. MAX 4 short sentences
2. List actual relations found in THIS data only
3. Format: "column → relates to → value"  
4. NO explanations, NO definitions, NO tutorials
5. If no data, say "No data found"`;

        const answer = await GeminiService.generateFast(
            `Query: ${query}\n\nGive ONLY the relations from MY uploaded data. Be brief.`,
            systemPrompt
        );

        // Store graph data for session
        if (sessionId && relations.length > 0) {
            try {
                const sessionObjectId = new mongoose.Types.ObjectId(sessionId);
                const entities = dataInfo.flatMap(f => [
                    ...f.columns.map(c => ({ name: c, type: "column" })),
                    ...f.values.slice(0, 10).map(v => ({ name: v, type: "value" }))
                ]);
                const relationships = dataInfo[0]?.columns.flatMap(col => {
                    const vals = dataInfo[0]?.sample.map((r: any) => r[col]).filter(Boolean);
                    const unique = [...new Set(vals)].slice(0, 5);
                    return unique.map(v => ({ from: col, to: String(v), type: "has_value" }));
                }) || [];

                const existing = await GraphCache.findOne({ sessionId: sessionObjectId });
                if (existing) {
                    const existingNames = new Set(existing.entities?.map(e => e.name) || []);
                    existing.entities = [...(existing.entities || []), ...entities.filter(e => !existingNames.has(e.name))];
                    existing.relationships = [...(existing.relationships || []), ...relationships];
                    await existing.save();
                } else {
                    await GraphCache.create({
                        sessionId: sessionObjectId,
                        entities,
                        relationships
                    });
                }
                console.log(`Stored ${entities.length} entities, ${relationships.length} relations`);
            } catch (e) {
                console.warn("Graph storage error:", e);
            }
        }

        return {
            answer,
            sourceNodes: files.map(f => ({
                id: f._id.toString(),
                content: f.originalName,
                type: "File"
            })),
            reasoningTrace: `GraphRAG: Found ${relations.length} relations in ${files.length} file(s)`,
        };
    }
}
