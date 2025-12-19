import { gql } from "@apollo/client";

export const QUERY_RAG = gql`
  mutation QueryRAG($userInput: String!, $complexity: String) {
    queryRAG(userInput: $userInput, complexity: $complexity) {
      answer
      strategyUsed
      reasoningTrace
      executionPlan
      sourceNodes {
        id
        content
        type
        score
      }
    }
  }
`;
