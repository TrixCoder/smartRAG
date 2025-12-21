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

  type ChatMessage {
    id: ID!
    role: String!
    content: String!
    strategy: String
    reasoningTrace: String
    createdAt: String!
  }

  type Session {
    id: ID!
    title: String!
    createdAt: String!
    updatedAt: String!
    messageCount: Int
  }

  type SessionWithMessages {
    session: Session!
    messages: [ChatMessage]!
  }

  type UploadedFile {
    id: ID!
    originalName: String!
    fileType: String!
    hasRelationalData: Boolean!
    extractedEntities: [String]
    createdAt: String!
  }

  type Query {
    healthCheck: String
    getSessions: [Session]!
    getSession(sessionId: ID!): SessionWithMessages
    getSessionFiles(sessionId: ID!): [UploadedFile]!
  }

  type Mutation {
    createSession(title: String): Session!
    deleteSession(sessionId: ID!): Boolean!
    updateSessionTitle(sessionId: ID!, title: String!): Session
    queryRAG(sessionId: ID!, userInput: String!, complexity: String): RAGResponse
  }
`;
