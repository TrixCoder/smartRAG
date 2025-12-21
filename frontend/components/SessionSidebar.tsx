"use client";

import { useQuery, useMutation } from "@apollo/client/react";
import { GET_SESSIONS, CREATE_SESSION, DELETE_SESSION } from "@/lib/graphql";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, MessageSquare, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Session {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
}

interface GetSessionsData {
    getSessions: Session[];
}

interface CreateSessionData {
    createSession: Session;
}

interface SessionSidebarProps {
    currentSessionId: string | null;
    onSessionSelect: (sessionId: string) => void;
    onNewSession: (sessionId: string) => void;
}

export default function SessionSidebar({ currentSessionId, onSessionSelect, onNewSession }: SessionSidebarProps) {
    const { data, loading, refetch } = useQuery<GetSessionsData>(GET_SESSIONS, {
        fetchPolicy: "network-only",
    });

    const [createSession, { loading: creating }] = useMutation<CreateSessionData>(CREATE_SESSION);
    const [deleteSession] = useMutation(DELETE_SESSION);

    const sessions: Session[] = data?.getSessions || [];

    const handleNewSession = async () => {
        try {
            const { data } = await createSession({ variables: { title: "New Chat" } });
            if (data?.createSession?.id) {
                onNewSession(data.createSession.id);
                refetch();
            }
        } catch (error) {
            console.error("Failed to create session:", error);
        }
    };

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (confirm("Delete this chat and all its data?")) {
            try {
                await deleteSession({ variables: { sessionId } });
                refetch();
                if (sessionId === currentSessionId) {
                    // Select another session or create new
                    const remaining = sessions.filter(s => s.id !== sessionId);
                    if (remaining.length > 0) {
                        onSessionSelect(remaining[0].id);
                    } else {
                        handleNewSession();
                    }
                }
            } catch (error) {
                console.error("Failed to delete session:", error);
            }
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="w-64 h-full bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                <Button
                    onClick={handleNewSession}
                    disabled={creating}
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                >
                    {creating ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Plus className="w-4 h-4 mr-2" />
                    )}
                    New Chat
                </Button>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                    </div>
                ) : sessions.length === 0 ? (
                    <p className="text-center text-zinc-500 text-sm py-8">
                        No chats yet. Start a new one!
                    </p>
                ) : (
                    <AnimatePresence>
                        {sessions.map((session) => (
                            <motion.button
                                key={session.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                onClick={() => onSessionSelect(session.id)}
                                className={`w-full text-left p-3 rounded-lg transition-colors group flex items-start gap-3 ${session.id === currentSessionId
                                    ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                                    }`}
                            >
                                <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                        {session.title}
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        {formatDate(session.updatedAt)} • {session.messageCount || 0} msgs
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-opacity"
                                >
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                </button>
                            </motion.button>
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-center">
                SmartRAG
            </div>
        </div>
    );
}
