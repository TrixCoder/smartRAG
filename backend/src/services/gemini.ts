import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(API_KEY || "");

// Configuration to reduce safety blocks for legitimate data analysis, 
// ensuring we don't get false positives on company financial data.
const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
];

// Model Definitions
// Pro: For Reasoning, Routing, and Complex Graph Analysis
const modelPro = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    safetySettings
});

// Flash: For Summarization, Simple RAG, High Volume tasks (using 2.0 for speed)
const modelFlash = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    safetySettings
});

// Embedding Model
const modelEmbedding = genAI.getGenerativeModel({
    model: "text-embedding-004"
});

export const GeminiService = {
    /**
     * Generates embeddings for text.
     * Optimized for RAG retrieval.
     */
    async generateEmbedding(text: string): Promise<number[]> {
        try {
            if (!text) return [];
            // Clean text to remove excessive whitespace -> saves tokens/noise
            const cleanText = text.replace(/\s+/g, " ").trim();
            const result = await modelEmbedding.embedContent(cleanText);
            return result.embedding.values;
        } catch (error) {
            console.error("Gemini Embedding Error:", error);
            throw error;
        }
    },

    /**
     * Complex Reasoning with JSON output. 
     * Uses Gemini 1.5 Pro.
     * Enforces JSON structure via system instruction passed as first message.
     */
    async analyzeComplex(prompt: string, systemInstruction: string): Promise<any> {
        try {
            // Create a model instance with specific system instruction for this request
            const modelWithSystem = genAI.getGenerativeModel({
                model: "gemini-1.5-pro",
                safetySettings,
                systemInstruction: systemInstruction,
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.2,
                }
            });

            const result = await modelWithSystem.generateContent(prompt);
            const responseText = result.response.text();
            return JSON.parse(responseText);
        } catch (error) {
            console.error("Gemini Pro Error:", error);
            throw error;
        }
    },

    /**
     * Fast text generation / summarization.
     * Uses Gemini 2.0 Flash.
     */
    async generateFast(prompt: string, context: string = ""): Promise<string> {
        try {
            const result = await modelFlash.generateContent(
                `Context: ${context}\n\nTask: ${prompt}`
            );
            return result.response.text();
        } catch (error) {
            console.error("Gemini Flash Error:", error);
            throw error;
        }
    },

    /**
     * The "Judge" - decides strictly which RAG path to take.
     * This is a critical function for the Unified RAG System.
     */
    async routeQuery(query: string, fileMetadata: any): Promise<{ strategy: string; reasoning: string; plan: string[] }> {
        const systemPrompt = `You are the RAG Router, an expert AI system architecture judge.
Analyze the user's Query and available File Metadata.

Decide the best RAG strategy based on these rules:
1. "GraphRAG": If the data/query involves complex relationships, ownership structures, hierarchies, "A implies B", or specific entities (Companies, People) linked by actions.
2. "MultiModal": If input contains images, audio, or video files.
3. "Advanced": For high-volume unstructured text retrieval (e.g., "Summarize this 100-page PDF").
4. "Agentic": If the query demands a multi-step execution plan (e.g., "Compare X and Y, then calculate Z").

Output strictly in JSON format:
{
  "strategy": "GraphRAG" | "Advanced" | "Agentic" | "MultiModal",
  "reasoning": "Brief explanation...",
  "plan": ["Step 1", "Step 2"...]
}`;

        const userPrompt = `Query: "${query}"
File Metadata: ${JSON.stringify(fileMetadata)}`;

        return this.analyzeComplex(userPrompt, systemPrompt);
    },

    /**
     * Generates Cypher queries for Neo4j.
     */
    async generateCypher(schema: string, query: string): Promise<string> {
        const systemPrompt = `You are a Neo4j Cypher expert. 
Given the Graph Schema: ${schema}
Generate a READ-ONLY Cypher query to answer: "${query}"
Return ONLY the Cypher string, no markdown.`;

        // Create model with system instruction for Cypher generation
        const modelWithSystem = genAI.getGenerativeModel({
            model: "gemini-1.5-pro",
            safetySettings,
            systemInstruction: systemPrompt,
            generationConfig: { temperature: 0 }
        });

        const result = await modelWithSystem.generateContent("Generate Cypher.");
        return result.response.text().replace(/```cypher|```/g, "").trim();
    }
};
