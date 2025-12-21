"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { QUERY_RAG, GET_SESSION } from "@/lib/graphql";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
    BrainCircuit,
    FileText,
    Bot,
    ArrowRight,
    Loader2,
    Share2,
    UploadCloud,
    X,
    File,
    Network,
    Check,
    Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import KnowledgeGraphModal from "./KnowledgeGraphModal";
import MarkdownMessage from "./MarkdownMessage";

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    strategy?: string;
    trace?: string[];
    executionPlan?: string[];
    isNew?: boolean;
}

interface UploadedFile {
    id: string;
    filename: string;
    type: string;
    hasRelationalData: boolean;
    extractedEntities: string[];
}

interface RAGChatProps {
    sessionId: string | null;
}

interface SessionMessage {
    id: string;
    role: string;
    content: string;
    strategy: string;
    reasoningTrace: string;
    createdAt: string;
}

interface GetSessionData {
    getSession: {
        session: { id: string; title: string };
        messages: SessionMessage[];
    } | null;
}

export default function RAGChat({ sessionId }: RAGChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [queryRAG, { loading }] = useMutation<{ queryRAG: any }>(QUERY_RAG);
    const [currentStep, setCurrentStep] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [showGraph, setShowGraph] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch session messages when sessionId changes
    const { data: sessionData, loading: loadingSession } = useQuery<GetSessionData>(GET_SESSION, {
        variables: { sessionId },
        skip: !sessionId,
        fetchPolicy: "network-only",
    });

    // Load messages when session changes
    useEffect(() => {
        if (sessionData?.getSession?.messages) {
            const loadedMessages: ChatMessage[] = sessionData.getSession.messages.map((msg) => ({
                role: msg.role as "user" | "assistant",
                content: msg.content,
                strategy: msg.strategy,
                trace: msg.reasoningTrace ? msg.reasoningTrace.split("\n") : [],
                isNew: false,
            }));
            setMessages(loadedMessages);
        } else {
            setMessages([]);
        }
        setUploadedFiles([]);
    }, [sessionId, sessionData]);

    const steps = [
        "Analyzing",
        "Routing",
        "Retrieving",
        "Synthesizing"
    ];

    const handleSend = async () => {
        if (!input.trim() || !sessionId) return;

        const userMsg: ChatMessage = { role: "user", content: input };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setCurrentStep(0);

        const stepInterval = setInterval(() => {
            setCurrentStep((prev) => (prev < 3 ? prev + 1 : prev));
        }, 700);

        try {
            const { data } = await queryRAG({
                variables: {
                    sessionId,
                    userInput: userMsg.content,
                    complexity: uploadedFiles.some(f => f.hasRelationalData) ? "high" : "low"
                }
            });

            clearInterval(stepInterval);
            setCurrentStep(4);

            if (data && data.queryRAG) {
                const result = data.queryRAG;

                const assistantMsg: ChatMessage = {
                    role: "assistant",
                    content: result.answer,
                    strategy: result.strategyUsed,
                    trace: result.reasoningTrace ? result.reasoningTrace.split("\n") : [],
                    executionPlan: result.executionPlan,
                    isNew: true
                };

                setMessages((prev) => [...prev, assistantMsg]);
            }
        } catch (err) {
            clearInterval(stepInterval);
            console.error(err);
            setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
        }
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0 || !sessionId) return;

        setIsUploading(true);
        const formData = new FormData();

        formData.append("sessionId", sessionId);
        Array.from(files).forEach(file => {
            formData.append("files", file);
        });

        try {
            const response = await fetch("http://localhost:4000/upload", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (data.success) {
                setUploadedFiles(prev => [...prev, ...data.files]);
            }
        } catch (error) {
            console.error("Upload error:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileUpload(e.dataTransfer.files);
    }, []);

    const removeFile = async (id: string) => {
        try {
            await fetch(`http://localhost:4000/files/${id}`, {
                method: "DELETE",
            });
            setUploadedFiles(prev => prev.filter(f => f.id !== id));
        } catch (error) {
            console.error("Failed to delete file:", error);
        }
    };

    return (
        <>
            <Card
                className={cn(
                    "w-full h-full flex flex-col bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-2xl overflow-hidden",
                    isDragging && "ring-2 ring-teal-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-zinc-950"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Header */}
                <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between bg-white/50 dark:bg-zinc-900/50">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-teal-500 rounded-full" />
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Ready</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-xs h-8 text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400"
                        onClick={() => setShowGraph(true)}
                        disabled={uploadedFiles.length === 0}
                    >
                        <Network className="w-3.5 h-3.5" />
                        Knowledge Graph
                    </Button>
                </div>

                {/* Uploaded Files */}
                <AnimatePresence>
                    {uploadedFiles.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-4 py-2.5 bg-zinc-50/50 dark:bg-zinc-900/30 border-b border-zinc-100 dark:border-zinc-800/50"
                        >
                            <div className="flex items-center gap-2 flex-wrap">
                                {uploadedFiles.map(file => (
                                    <Badge
                                        key={file.id}
                                        variant="secondary"
                                        className="gap-1.5 pr-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                                    >
                                        <File className="w-3 h-3 text-zinc-400" />
                                        <span className="max-w-[120px] truncate">{file.filename}</span>
                                        {file.hasRelationalData && (
                                            <span className="px-1 py-0.5 text-[10px] bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded">Graph</span>
                                        )}
                                        <button
                                            onClick={() => removeFile(file.id)}
                                            className="ml-0.5 p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Drag Overlay */}
                <AnimatePresence>
                    {isDragging && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-teal-500/5 backdrop-blur-sm z-10 flex items-center justify-center border-2 border-dashed border-teal-500/50 rounded-2xl m-1"
                        >
                            <div className="text-center">
                                <UploadCloud className="w-10 h-10 text-teal-600 dark:text-teal-400 mx-auto mb-2" />
                                <p className="text-teal-700 dark:text-teal-300 font-medium text-sm">Drop files here</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Messages */}
                <ScrollArea className="flex-1 p-5">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center py-12">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-800/20 flex items-center justify-center mb-4">
                                <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                            </div>
                            <h3 className="font-medium text-zinc-800 dark:text-zinc-200 mb-1">Start a conversation</h3>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs">
                                Upload documents or ask questions. The system automatically selects the best retrieval strategy.
                            </p>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className={cn(
                                "flex flex-col mb-5 max-w-[80%]",
                                msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                            )}
                        >
                            <div className={cn(
                                "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                                msg.role === "user"
                                    ? "bg-teal-600 text-white rounded-br-md"
                                    : "bg-zinc-100 dark:bg-zinc-800 rounded-bl-md max-w-full"
                            )}>
                                {msg.role === "user" ? (
                                    msg.content
                                ) : (
                                    <MarkdownMessage
                                        content={msg.content}
                                        isNew={msg.isNew}
                                    />
                                )}
                            </div>

                            {msg.role === "assistant" && msg.strategy && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="mt-2 flex flex-col gap-1.5"
                                >
                                    <Badge variant="outline" className="text-[10px] font-normal gap-1 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 w-fit">
                                        {getStrategyIcon(msg.strategy)}
                                        {msg.strategy}
                                    </Badge>
                                </motion.div>
                            )}
                        </motion.div>
                    ))}

                    {/* Loading Steps */}
                    {loading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center justify-center py-8"
                        >
                            <div className="flex items-center gap-1">
                                {steps.map((step, i) => (
                                    <React.Fragment key={i}>
                                        <div className="flex flex-col items-center">
                                            <div className={cn(
                                                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                                                i < currentStep
                                                    ? "bg-teal-600 text-white"
                                                    : i === currentStep
                                                        ? "bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 ring-2 ring-teal-600/20"
                                                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                                            )}>
                                                {i < currentStep ? <Check className="w-3.5 h-3.5" /> : i + 1}
                                            </div>
                                            <span className={cn(
                                                "text-[10px] mt-1",
                                                i === currentStep ? "text-teal-600 dark:text-teal-400 font-medium" : "text-zinc-400"
                                            )}>
                                                {step}
                                            </span>
                                        </div>
                                        {i < steps.length - 1 && (
                                            <div className={cn(
                                                "w-6 h-0.5 mb-4",
                                                i < currentStep ? "bg-teal-600" : "bg-zinc-200 dark:bg-zinc-700"
                                            )} />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </ScrollArea>

                {/* Input */}
                <div className="p-3 bg-white/50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800/50 flex gap-2 items-center">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        accept=".pdf,.csv,.json,.txt,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => handleFileUpload(e.target.files)}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <UploadCloud className="w-4 h-4" />
                        )}
                    </Button>
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
                        placeholder="Ask a question..."
                        className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 focus-visible:ring-teal-500 h-10"
                        disabled={loading}
                    />
                    <Button
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        size="icon"
                        className="h-9 w-9 rounded-xl bg-teal-600 hover:bg-teal-700 text-white shrink-0"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    </Button>
                </div>
            </Card>

            <KnowledgeGraphModal
                isOpen={showGraph}
                onClose={() => setShowGraph(false)}
            />
        </>
    );
}

function getStrategyIcon(strategy: string) {
    switch (strategy) {
        case "GraphRAG": return <Share2 className="w-3 h-3" />;
        case "Agentic": return <BrainCircuit className="w-3 h-3" />;
        case "Advanced": return <FileText className="w-3 h-3" />;
        default: return <Bot className="w-3 h-3" />;
    }
}
