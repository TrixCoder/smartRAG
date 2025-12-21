import { gql } from "@apollo/client";

// Session mutations & queries
export const GET_SESSIONS = gql`
  query GetSessions {
    getSessions {
      id
      title
      createdAt
      updatedAt
      messageCount
    }
  }
`;

export const GET_SESSION = gql`
  query GetSession($sessionId: ID!) {
    getSession(sessionId: $sessionId) {
      session {
        id
        title
        createdAt
        updatedAt
      }
      messages {
        id
        role
        content
        strategy
        reasoningTrace
        createdAt
      }
    }
  }
`;

export const GET_SESSION_FILES = gql`
  query GetSessionFiles($sessionId: ID!) {
    getSessionFiles(sessionId: $sessionId) {
      id
      originalName
      fileType
      hasRelationalData
      extractedEntities
      createdAt
    }
  }
`;

export const CREATE_SESSION = gql`
  mutation CreateSession($title: String) {
    createSession(title: $title) {
      id
      title
      createdAt
      updatedAt
      messageCount
    }
  }
`;

export const DELETE_SESSION = gql`
  mutation DeleteSession($sessionId: ID!) {
    deleteSession(sessionId: $sessionId)
  }
`;

export const UPDATE_SESSION_TITLE = gql`
  mutation UpdateSessionTitle($sessionId: ID!, $title: String!) {
    updateSessionTitle(sessionId: $sessionId, title: $title) {
      id
      title
    }
  }
`;

// RAG query with session
export const QUERY_RAG = gql`
  mutation QueryRAG($sessionId: ID!, $userInput: String!, $complexity: String) {
    queryRAG(sessionId: $sessionId, userInput: $userInput, complexity: $complexity) {
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
