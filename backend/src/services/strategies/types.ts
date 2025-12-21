export interface RAGResult {
    answer: string;
    sourceNodes: Array<{ id: string; content: string; nodeType: string; score?: number }>;
    reasoningTrace: string;
    executionPlan?: string[];
}

export interface IRAGStrategy {
    execute(query: string, context: any): Promise<RAGResult>;
}
