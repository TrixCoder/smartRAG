"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@apollo/client/react";
import { CREATE_SESSION } from "@/lib/graphql";
import RAGChat from "@/components/RAGChat";
import SessionSidebar from "@/components/SessionSidebar";

interface CreateSessionData {
  createSession: { id: string; title: string };
}

export default function Home() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [createSession] = useMutation<CreateSessionData>(CREATE_SESSION);

  // Create initial session on first load
  useEffect(() => {
    const savedSessionId = localStorage.getItem("smartrag_session");
    if (savedSessionId) {
      setCurrentSessionId(savedSessionId);
    } else {
      // Create a new session
      createSession({ variables: { title: "New Chat" } })
        .then(({ data }) => {
          if (data?.createSession?.id) {
            setCurrentSessionId(data.createSession.id);
            localStorage.setItem("smartrag_session", data.createSession.id);
          }
        })
        .catch(console.error);
    }
  }, [createSession]);

  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    localStorage.setItem("smartrag_session", sessionId);
  };

  const handleNewSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    localStorage.setItem("smartrag_session", sessionId);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-teal-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-teal-950/20 flex">
      {/* Sidebar */}
      <SessionSidebar
        currentSessionId={currentSessionId}
        onSessionSelect={handleSessionSelect}
        onNewSession={handleNewSession}
      />

      {/* Main Content */}
      <div className="flex-1 relative">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

        <div className="relative flex min-h-screen flex-col items-center justify-center p-6">
          <div className="w-full max-w-4xl h-[85vh] flex flex-col items-center">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-medium mb-4">
                <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse" />
                AI-Powered RAG
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
                SmartRAG
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-md mx-auto">
                Intelligent document analysis with automatic strategy selection
              </p>
            </div>

            <RAGChat sessionId={currentSessionId} />

            {/* Footer */}
            <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-600">
              Graph • Vector • Agentic retrieval
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
