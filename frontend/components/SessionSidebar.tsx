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
        <div className="w-full h-full bg-white dark:bg-black rounded-none flex flex-col">
            <div className="p-4">
                {/* Brand */}
                <div className="mb-6 flex items-center gap-2 px-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                        <span className="text-white font-bold text-xs">S</span>
                    </div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">SmartRAG</span>
                </div>

                <Button
                    onClick={handleNewSession}
                    disabled={creating}
                    className="w-full bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white shadow-lg shadow-teal-900/20 border-0 h-10 font-medium"
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
            <div className="flex-1 overflow-y-auto px-3 space-y-1">
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-600 px-3 py-2 uppercase tracking-wider">
                    Recent Chats
                </div>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                    </div>
                ) : sessions.length === 0 ? (
                    <p className="text-center text-zinc-500 text-xs py-8">
                        No chats yet. Start a new one!
                    </p>
                ) : (
                    <AnimatePresence>
                        {sessions.map((session) => (
                            <motion.div
                                key={session.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                onClick={() => onSessionSelect(session.id)}
                                className={`w-full text-left p-3 rounded-xl transition-all group flex items-start gap-3 cursor-pointer border ${session.id === currentSessionId
                                    ? "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-900/50 text-teal-700 dark:text-teal-300 shadow-sm"
                                    : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400"
                                    }`}
                            >
                                <MessageSquare className={`w-4 h-4 mt-0.5 shrink-0 ${session.id === currentSessionId ? "text-teal-600 dark:text-teal-400" : "text-zinc-400"}`} />
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium truncate ${session.id === currentSessionId ? "text-zinc-900 dark:text-zinc-100" : ""}`}>
                                        {session.title}
                                    </p>
                                    <p className="text-[10px] text-zinc-400 mt-1">
                                        {formatDate(session.updatedAt)} • {session.messageCount || 0} msgs
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-opacity"
                                >
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {/* Profile / Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                        <span className="text-xs font-semibold text-zinc-500">U</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-200">User</p>
                        <p className="text-xs text-zinc-500">Free Plan</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
