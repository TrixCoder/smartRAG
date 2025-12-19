import gql from "graphql-tag";

export const typeDefs = gql`
  type SourceNode {
    id: ID!
    content: String
    type: String
    score: Float
  }

  type RAGResponse {
    answer: String!
    strategyUsed: String!
    reasoningTrace: String!
    sourceNodes: [SourceNode]
    executionPlan: [String]
  }

  type Query {
    healthCheck: String
  }

  type Mutation {
    queryRAG(userInput: String!, complexity: String): RAGResponse
    # Upload not strictly implemented yet, just a placeholder
    uploadFile(filename: String!): Boolean 
  }
`;
