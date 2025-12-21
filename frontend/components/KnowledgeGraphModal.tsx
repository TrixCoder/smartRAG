"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";

// Dynamically import ForceGraph to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
});

interface Node {
    id: string;
    name: string;
    type: "file" | "entity";
    fileType?: string;
    val: number;
}

interface Link {
    source: string;
    target: string;
}

interface GraphData {
    nodes: Node[];
    links: Link[];
}

interface KnowledgeGraphModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string | null;
}

export default function KnowledgeGraphModal({ isOpen, onClose, sessionId }: KnowledgeGraphModalProps) {
    const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const graphRef = useRef<any>(null);

    useEffect(() => {
        if (isOpen && sessionId) {
            fetchGraphData();
        }
    }, [isOpen, sessionId]);

    const fetchGraphData = async () => {
        if (!sessionId) return;
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`http://localhost:4000/visualization?sessionId=${sessionId}`);
            const data = await response.json();

            if (data.nodes && data.links) {
                setGraphData(data);
            } else {
                setError("No visualization data available");
            }
        } catch (err) {
            setError("Failed to load visualization data");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleZoomIn = () => {
        if (graphRef.current) {
            graphRef.current.zoom(graphRef.current.zoom() * 1.5, 400);
        }
    };

    const handleZoomOut = () => {
        if (graphRef.current) {
            graphRef.current.zoom(graphRef.current.zoom() / 1.5, 400);
        }
    };

    const handleFitView = () => {
        if (graphRef.current) {
            graphRef.current.zoomToFit(400, 50);
        }
    };

    const getNodeColor = (node: any) => {
        if (node.type === "file") {
            switch (node.fileType) {
                case "pdf": return "#ef4444";
                case "csv": return "#22c55e";
                case "json": return "#f59e0b";
                case "image": return "#8b5cf6";
                default: return "#6b7280";
            }
        }
        // Entity nodes - color by category
        if (node.category === "column") return "#14b8a6"; // Teal for columns
        if (node.category === "value") return "#3b82f6"; // Blue for values
        return "#6366f1"; // Indigo for other entities
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Knowledge Graph</h2>
                            <p className="text-sm text-gray-500">Visualizing extracted entities and relationships</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={handleZoomOut}>
                                <ZoomOut className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={handleZoomIn}>
                                <ZoomIn className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={handleFitView}>
                                <Maximize2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={onClose}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Graph Area */}
                    <div className="flex-1 bg-gray-50 dark:bg-zinc-950 relative">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <p>{error}</p>
                                <Button variant="outline" className="mt-4" onClick={fetchGraphData}>
                                    Retry
                                </Button>
                            </div>
                        ) : graphData.nodes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <p>No data to visualize yet.</p>
                                <p className="text-sm">Upload files to see the knowledge graph.</p>
                            </div>
                        ) : (
                            <ForceGraph2D
                                ref={graphRef}
                                graphData={graphData}
                                nodeLabel="name"
                                nodeColor={(node: any) => getNodeColor(node as Node)}
                                nodeRelSize={6}
                                linkColor={() => "#94a3b8"}
                                linkWidth={1.5}
                                linkDirectionalParticles={2}
                                linkDirectionalParticleWidth={2}
                                backgroundColor="transparent"
                                nodeCanvasObject={(node: any, ctx, globalScale) => {
                                    const label = node.name;
                                    const fontSize = 12 / globalScale;
                                    ctx.font = `${fontSize}px Inter, sans-serif`;

                                    // Draw node circle
                                    ctx.beginPath();
                                    ctx.arc(node.x, node.y, node.type === "file" ? 8 : 5, 0, 2 * Math.PI);
                                    ctx.fillStyle = getNodeColor(node);
                                    ctx.fill();

                                    // Draw label
                                    ctx.textAlign = "center";
                                    ctx.textBaseline = "middle";
                                    ctx.fillStyle = "#374151";
                                    ctx.fillText(label, node.x, node.y + 12);
                                }}
                            />
                        )}

                        {/* Legend */}
                        <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-lg p-3 text-xs space-y-1">
                            <div className="font-medium mb-2 text-gray-700 dark:text-gray-300">Legend</div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-green-500" />
                                <span>CSV Files</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-amber-500" />
                                <span>JSON Files</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500" />
                                <span>PDF Files</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-teal-500" />
                                <span>Columns</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-blue-500" />
                                <span>Values</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
