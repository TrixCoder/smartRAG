import { GeminiService } from "./gemini";

interface Chunk {
    id: string;
    content: string;
    embedding?: number[];
    metadata: {
        source: string;
        chunkIndex: number;
        totalChunks: number;
        type: "semantic" | "fixed" | "sentence";
        tokens?: number;
    };
}

interface ChunkingOptions {
    maxChunkSize?: number;
    overlap?: number;
    strategy?: "semantic" | "fixed" | "sentence";
}

/**
 * VectorService handles intelligent text chunking and embedding generation.
 * Optimizes for token efficiency and retrieval quality.
 */
export const VectorService = {
    /**
     * Detects the best chunking strategy based on content type.
     */
    detectStrategy(content: string, fileType: string): "semantic" | "fixed" | "sentence" {
        // For structured data (CSV, JSON), use smaller fixed chunks
        if (fileType === "csv" || fileType === "json") {
            return "fixed";
        }

        // For prose/documents, use sentence-based chunking for better context
        if (content.length > 2000 && content.includes(". ")) {
            return "sentence";
        }

        // For shorter content or code, use semantic boundaries
        return "semantic";
    },

    /**
     * Splits text into chunks based on the selected strategy.
     */
    chunkText(text: string, options: ChunkingOptions = {}): string[] {
        const {
            maxChunkSize = 1000,
            overlap = 100,
            strategy = "sentence"
        } = options;

        const chunks: string[] = [];
        const cleanText = text.replace(/\s+/g, " ").trim();

        if (!cleanText) return [];

        switch (strategy) {
            case "sentence":
                return this.chunkBySentence(cleanText, maxChunkSize, overlap);
            case "semantic":
                return this.chunkBySemantic(cleanText, maxChunkSize, overlap);
            case "fixed":
            default:
                return this.chunkByFixed(cleanText, maxChunkSize, overlap);
        }
    },

    /**
     * Fixed-size chunking with overlap.
     * Best for: CSV data, logs, structured content.
     */
    chunkByFixed(text: string, maxSize: number, overlap: number): string[] {
        const chunks: string[] = [];
        let start = 0;

        while (start < text.length) {
            const end = Math.min(start + maxSize, text.length);
            chunks.push(text.slice(start, end));
            start = end - overlap;

            if (start >= text.length) break;
        }

        return chunks;
    },

    /**
     * Sentence-based chunking.
     * Best for: Documents, articles, prose.
     */
    chunkBySentence(text: string, maxSize: number, overlap: number): string[] {
        const sentenceEnders = /(?<=[.!?])\s+/g;
        const sentences = text.split(sentenceEnders).filter(s => s.trim());
        const chunks: string[] = [];
        let currentChunk = "";
        let overlapBuffer = "";

        for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > maxSize && currentChunk) {
                chunks.push(currentChunk.trim());
                // Keep last portion for overlap
                const words = currentChunk.split(" ");
                overlapBuffer = words.slice(-Math.ceil(words.length * 0.1)).join(" ");
                currentChunk = overlapBuffer + " " + sentence;
            } else {
                currentChunk += (currentChunk ? " " : "") + sentence;
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    },

    /**
     * Semantic chunking - splits at paragraph/section boundaries.
     * Best for: Mixed content, markdown, code.
     */
    chunkBySemantic(text: string, maxSize: number, overlap: number): string[] {
        // Split by paragraph breaks, headers, or double newlines
        const paragraphs = text.split(/\n\n+|\n(?=[A-Z#])/g).filter(p => p.trim());
        const chunks: string[] = [];
        let currentChunk = "";

        for (const para of paragraphs) {
            if (currentChunk.length + para.length > maxSize && currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = para;
            } else {
                currentChunk += (currentChunk ? "\n\n" : "") + para;
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    },

    /**
     * Generates embeddings for chunks efficiently.
     * Batches requests to minimize API calls.
     */
    async generateChunkEmbeddings(
        chunks: string[],
        source: string,
        strategy: "semantic" | "fixed" | "sentence" = "sentence"
    ): Promise<Chunk[]> {
        const results: Chunk[] = [];

        // Process in batches of 5 to avoid rate limits
        const batchSize = 5;

        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);

            const embedPromises = batch.map(async (content, batchIdx) => {
                const globalIdx = i + batchIdx;

                try {
                    const embedding = await GeminiService.generateEmbedding(content);

                    return {
                        id: `${source}-${globalIdx}`,
                        content,
                        embedding,
                        metadata: {
                            source,
                            chunkIndex: globalIdx,
                            totalChunks: chunks.length,
                            type: strategy,
                            tokens: Math.ceil(content.length / 4) // Rough token estimate
                        }
                    };
                } catch (error) {
                    console.error(`Embedding failed for chunk ${globalIdx}:`, error);
                    return {
                        id: `${source}-${globalIdx}`,
                        content,
                        metadata: {
                            source,
                            chunkIndex: globalIdx,
                            totalChunks: chunks.length,
                            type: strategy
                        }
                    };
                }
            });

            const batchResults = await Promise.all(embedPromises);
            results.push(...batchResults);
        }

        return results;
    },

    /**
     * Full pipeline: analyze content, chunk, embed.
     */
    async processDocument(
        content: string,
        source: string,
        fileType: string
    ): Promise<Chunk[]> {
        // 1. Detect best strategy
        const strategy = this.detectStrategy(content, fileType);
        console.log(`Using ${strategy} chunking for ${source}`);

        // 2. Chunk content
        const chunks = this.chunkText(content, {
            strategy,
            maxChunkSize: fileType === "csv" ? 500 : 1000,
            overlap: fileType === "csv" ? 50 : 100
        });

        console.log(`Created ${chunks.length} chunks from ${source}`);

        // 3. Generate embeddings
        const embeddedChunks = await this.generateChunkEmbeddings(chunks, source, strategy);

        return embeddedChunks;
    },

    /**
     * Calculates cosine similarity between two vectors.
     */
    cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    },

    /**
     * Finds the most relevant chunks for a query.
     */
    async search(
        query: string,
        chunks: Chunk[],
        topK: number = 5
    ): Promise<Chunk[]> {
        const queryEmbedding = await GeminiService.generateEmbedding(query);

        const scored = chunks
            .filter(c => c.embedding)
            .map(chunk => ({
                chunk,
                score: this.cosineSimilarity(queryEmbedding, chunk.embedding!)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        return scored.map(s => s.chunk);
    }
};
