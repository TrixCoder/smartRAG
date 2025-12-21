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
            let sample: any[] = [];
            try {
                sample = f.sampleData ? JSON.parse(f.sampleData).slice(0, 10) : [];
            } catch { }
            return { name: f.originalName, columns, sample, summary: f.contentSummary || "" };
        });

        // 1. Build rich semantic relations (Row-Based)
        // Heuristic: Assume first column or 'id'/'name' column is the Subject, others are Attributes.
        const relations: string[] = [];
        const graphRelationships: any[] = [];
        const graphEntities: any[] = [];

        dataInfo.forEach(file => {
            if (file.columns.length > 0 && file.sample.length > 0) {
                // Identify Subject Column (prefer ID or Name)
                const subjectCol = file.columns.find(c => c.toLowerCase().includes("id") || c.toLowerCase().includes("name") || c.toLowerCase().includes("title")) || file.columns[0];
                const attributeCols = file.columns.filter(c => c !== subjectCol);

                file.sample.forEach((row: any) => {
                    const subjectVal = row[subjectCol];
                    if (!subjectVal) return;

                    // Add Subject Entity
                    graphEntities.push({ name: String(subjectVal), entityType: subjectCol });

                    attributeCols.forEach(attrCol => {
                        const attrVal = row[attrCol];
                        if (attrVal) {
                            // Link Subject -> Attribute Value
                            relations.push(`${subjectVal} → ${attrCol} → ${attrVal}`);

                            // Add Attribute Entity
                            graphEntities.push({ name: String(attrVal), entityType: attrCol });

                            // Add Relationship
                            graphRelationships.push({
                                from: String(subjectVal),
                                to: String(attrVal),
                                relationType: attrCol // Use column name as relation type (e.g. "category", "price")
                            });
                        }
                    });
                });
            }

            // Fallback: If no sample data (e.g. PDF), use extracted entities linkage
            if (file.sample.length === 0 && file.columns.length > 0) {
                file.columns.forEach(col => {
                    relations.push(`File ${file.name} → contains → ${col}`);
                    graphRelationships.push({ from: file.name, to: col, relationType: "contains" });
                    graphEntities.push({ name: col, entityType: "column" });
                    graphEntities.push({ name: file.name, entityType: "file" });
                });
            }
        });

        // Remove duplicates
        const uniqueRelations = [...new Set(relations)].slice(0, 50); // Limit context size

        // UPDATED PROMPT: Concise but Explanatory
        const systemPrompt = `You are a helpful Data Analyst looking at a Knowledge Graph.

DATA CONTEXT:
${uniqueRelations.join("\n")}

RULES:
1. Analyze the relations to answer the user's query.
2. Be CONCISE but EXPLANATORY (Max 3 paragraphs).
3. Do NOT just list data. Explain the *patterns* or *connections* you see.
4. If checking for specific items (e.g. "BrandA"), verify if they exist in the provided relations.
5. Use natural language. Format with bullet points if helpful.`;

        const answer = await GeminiService.generateFast(
            `Query: ${query}\n\nAnalyze the data relations above.`,
            systemPrompt
        );

        // Store graph data for session
        if (sessionId && graphRelationships.length > 0) {
            try {
                const sessionObjectId = new mongoose.Types.ObjectId(sessionId);

                // Deduplicate entities and relationships before saving
                const uniqueEntitiesMap = new Map();
                graphEntities.forEach(e => uniqueEntitiesMap.set(e.name, e));
                const uniqueEntities = Array.from(uniqueEntitiesMap.values()).slice(0, 100);

                const existing = await GraphCache.findOne({ sessionId: sessionObjectId });
                if (existing) {
                    const existingNames = new Set(existing.entities?.map(e => e.name) || []);
                    const newEntities = uniqueEntities.filter(e => !existingNames.has(e.name));

                    existing.entities = [...(existing.entities || []), ...newEntities];
                    // Append new relationships (limit total to avoid explosion)
                    existing.relationships = [...(existing.relationships || []), ...graphRelationships].slice(-500);
                    await existing.save();
                } else {
                    await GraphCache.create({
                        sessionId: sessionObjectId,
                        entities: uniqueEntities,
                        relationships: graphRelationships.slice(0, 500)
                    });
                }
                console.log(`Stored ${uniqueEntities.length} entities and ${graphRelationships.length} relationships`);
            } catch (e) {
                console.warn("Graph storage error:", e);
            }
        }

        return {
            answer,
            sourceNodes: files.map(f => ({
                id: f._id.toString(),
                content: f.originalName,
                nodeType: "File"
            })),
            reasoningTrace: `GraphRAG: Analyzed ${uniqueRelations.length} relations from ${files.length} file(s).`,
        };
    }
}
