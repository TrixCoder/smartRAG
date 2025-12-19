import { parse } from "csv-parse/sync";
import fs from "fs";

interface CSVAnalysis {
    columns: string[];
    rowCount: number;
    sampleRows: Record<string, any>[];
    uniqueCategories: string[];
    stats: Record<string, { type: string; uniqueCount?: number; min?: number; max?: number }>;
}

/**
 * Parses and analyzes a CSV file
 */
export function analyzeCSV(filePath: string, maxSampleRows = 20): CSVAnalysis {
    const content = fs.readFileSync(filePath, "utf-8");

    // Parse CSV
    const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
    });

    if (records.length === 0) {
        return {
            columns: [],
            rowCount: 0,
            sampleRows: [],
            uniqueCategories: [],
            stats: {}
        };
    }

    const columns = Object.keys(records[0]);
    const sampleRows = records.slice(0, maxSampleRows);

    // Analyze each column
    const stats: Record<string, any> = {};
    const categoricalColumns = ["category", "brand", "type", "status", "segment"];
    const uniqueCategories: string[] = [];

    columns.forEach(col => {
        const values = records.map((r: any) => r[col]).filter((v: any) => v !== "" && v !== null);
        const uniqueValues = [...new Set(values)];

        // Detect type
        const numericValues = values.filter((v: any) => !isNaN(parseFloat(v)));
        const isNumeric = numericValues.length > values.length * 0.8;

        if (isNumeric) {
            const nums = numericValues.map((v: any) => parseFloat(v));
            stats[col] = {
                type: "numeric",
                min: Math.min(...nums),
                max: Math.max(...nums),
                uniqueCount: uniqueValues.length
            };
        } else {
            stats[col] = {
                type: "categorical",
                uniqueCount: uniqueValues.length
            };

            // Extract unique categorical values for relevant columns
            if (categoricalColumns.some(c => col.toLowerCase().includes(c)) && uniqueValues.length <= 50) {
                uniqueCategories.push(...uniqueValues.slice(0, 10) as string[]);
            }
        }
    });

    return {
        columns,
        rowCount: records.length,
        sampleRows,
        uniqueCategories: [...new Set(uniqueCategories)],
        stats
    };
}

/**
 * Extracts entities from CSV analysis for knowledge graph
 */
export function extractEntitiesFromCSV(analysis: CSVAnalysis, filename: string): string[] {
    const entities: string[] = [];

    // Add schema as entities
    analysis.columns.forEach(col => {
        entities.push(`Column: ${col}`);
    });

    // Add unique categorical values as entities
    analysis.uniqueCategories.forEach(cat => {
        if (cat && cat.toString().length > 1 && cat.toString().length < 50) {
            entities.push(cat.toString());
        }
    });

    // Add filename context
    entities.push(`Source: ${filename}`);

    return [...new Set(entities)].slice(0, 50); // Limit to 50 entities
}

/**
 * Generates a summary for the AI to understand the data
 */
export function generateCSVSummary(analysis: CSVAnalysis, filename: string): string {
    const summary = [
        `File: ${filename}`,
        `Rows: ${analysis.rowCount.toLocaleString()}`,
        `Columns: ${analysis.columns.join(", ")}`,
        "",
        "Schema:",
    ];

    Object.entries(analysis.stats).forEach(([col, stat]) => {
        if (stat.type === "numeric") {
            summary.push(`  - ${col}: numeric (range: ${stat.min} - ${stat.max})`);
        } else {
            summary.push(`  - ${col}: categorical (${stat.uniqueCount} unique values)`);
        }
    });

    if (analysis.uniqueCategories.length > 0) {
        summary.push("");
        summary.push(`Sample categories/values: ${analysis.uniqueCategories.slice(0, 15).join(", ")}`);
    }

    summary.push("");
    summary.push("Sample data:");
    analysis.sampleRows.slice(0, 5).forEach((row, i) => {
        const rowStr = Object.entries(row).map(([k, v]) => `${k}=${v}`).join(", ");
        summary.push(`  ${i + 1}. ${rowStr.substring(0, 200)}`);
    });

    return summary.join("\n");
}
