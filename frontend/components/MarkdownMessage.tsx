"use client";

import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
    content: string;
    isNew?: boolean;
    className?: string;
}

export default function MarkdownMessage({ content, isNew = false, className }: MarkdownMessageProps) {
    const [displayedContent, setDisplayedContent] = useState(isNew ? "" : content);
    const [isTyping, setIsTyping] = useState(isNew);

    useEffect(() => {
        if (!isNew) {
            setDisplayedContent(content);
            return;
        }

        let index = 0;
        const speed = 8; // Characters per frame

        const typeInterval = setInterval(() => {
            if (index < content.length) {
                // Type multiple characters at once for speed
                const nextIndex = Math.min(index + speed, content.length);
                setDisplayedContent(content.slice(0, nextIndex));
                index = nextIndex;
            } else {
                clearInterval(typeInterval);
                setIsTyping(false);
            }
        }, 16); // ~60fps

        return () => clearInterval(typeInterval);
    }, [content, isNew]);

    return (
        <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // Custom styling for markdown elements
                    h1: ({ children }) => (
                        <h1 className="text-lg font-semibold mt-4 mb-2 text-zinc-800 dark:text-zinc-200">{children}</h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="text-base font-semibold mt-3 mb-2 text-zinc-800 dark:text-zinc-200">{children}</h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="text-sm font-semibold mt-2 mb-1 text-zinc-700 dark:text-zinc-300">{children}</h3>
                    ),
                    p: ({ children }) => (
                        <p className="mb-2 last:mb-0 text-zinc-600 dark:text-zinc-300">{children}</p>
                    ),
                    ul: ({ children }) => (
                        <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
                    ),
                    li: ({ children }) => (
                        <li className="text-zinc-600 dark:text-zinc-300">{children}</li>
                    ),
                    strong: ({ children }) => (
                        <strong className="font-semibold text-zinc-800 dark:text-zinc-100">{children}</strong>
                    ),
                    code: ({ children, className }) => {
                        const isInline = !className;
                        return isInline ? (
                            <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-xs font-mono text-teal-700 dark:text-teal-300">
                                {children}
                            </code>
                        ) : (
                            <code className="block p-2 bg-zinc-100 dark:bg-zinc-800 rounded text-xs font-mono overflow-x-auto">
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children }) => (
                        <pre className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3 overflow-x-auto mb-2">
                            {children}
                        </pre>
                    ),
                    table: ({ children }) => (
                        <div className="overflow-x-auto mb-2">
                            <table className="min-w-full text-xs border-collapse">
                                {children}
                            </table>
                        </div>
                    ),
                    th: ({ children }) => (
                        <th className="border border-zinc-200 dark:border-zinc-700 px-2 py-1 bg-zinc-50 dark:bg-zinc-800 font-semibold text-left">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-1">
                            {children}
                        </td>
                    ),
                }}
            >
                {displayedContent}
            </ReactMarkdown>
            {isTyping && (
                <span className="inline-block w-1.5 h-4 bg-teal-500 animate-pulse ml-0.5" />
            )}
        </div>
    );
}
