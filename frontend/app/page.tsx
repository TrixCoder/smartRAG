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

  // Responsive state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when session changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [currentSessionId]);

  return (
    <main className="h-screen w-full bg-zinc-50 dark:bg-black flex overflow-hidden relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-50 via-white to-teal-50/20 dark:from-zinc-950 dark:via-zinc-900 dark:to-teal-950/10 z-0 pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none z-0" />

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 z-50 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
            <span className="text-white font-bold text-[10px]">S</span>
          </div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">SmartRAG</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-zinc-600 dark:text-zinc-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>

      {/* Sidebar - Desktop (Fixed) & Mobile (Slide-over) */}
      <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-white dark:bg-black transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? "translate-x-0 border-r border-zinc-200 dark:border-zinc-800 shadow-2xl" : "-translate-x-full md:border-r md:border-zinc-200 md:dark:border-zinc-800"}`}>
        <SessionSidebar
          currentSessionId={currentSessionId}
          onSessionSelect={handleSessionSelect}
          onNewSession={handleNewSession}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative z-10 w-full md:max-w-[calc(100%-18rem)]">
        <div className="flex-1 h-full p-4 md:p-6 pt-16 md:pt-6 flex flex-col items-center justify-center">
          <div className="w-full h-full max-w-5xl flex flex-col">
            <RAGChat sessionId={currentSessionId} />
          </div>
        </div>
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </main>
  );
}
