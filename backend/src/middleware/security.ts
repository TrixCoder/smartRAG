import { Request, Response, NextFunction } from "express";
import xss from "xss";

// Blocked patterns for prompt injection prevention
const PROMPT_INJECTION_PATTERNS = [
    /ignore\s+(previous|all|above)\s+(instructions?|prompts?)/i,
    /disregard\s+(previous|all|above)/i,
    /forget\s+(everything|all|previous)/i,
    /you\s+are\s+now\s+a/i,
    /pretend\s+(to\s+be|you\s+are)/i,
    /act\s+as\s+(if|a)/i,
    /jailbreak/i,
    /dan\s+mode/i,
    /system\s*:\s*/i,
    /\[system\]/i,
    /{{.*}}/,  // Template injection
    /<script/i,
    /javascript:/i,
];

// Blocked patterns for NoSQL injection
const NOSQL_INJECTION_PATTERNS = [
    /\$where/i,
    /\$ne/i,
    /\$gt/i,
    /\$lt/i,
    /\$regex/i,
    /\$or/i,
    /\$and/i,
    /\{\s*"\$\w+"/,  // MongoDB operators in JSON
];

// Directory traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
    /\.\.\//,
    /\.\.\\/,
    /%2e%2e%2f/i,
    /%2e%2e%5c/i,
    /\.\.%2f/i,
    /\.\.%5c/i,
];

/**
 * Sanitize string input - removes XSS and dangerous patterns
 */
export function sanitizeInput(input: string): string {
    if (typeof input !== "string") return "";

    // Remove XSS
    let sanitized = xss(input, {
        whiteList: {},  // No HTML allowed
        stripIgnoreTag: true,
        stripIgnoreTagBody: ["script", "style"],
    });

    // Limit length
    sanitized = sanitized.substring(0, 10000);

    return sanitized.trim();
}

/**
 * Check for prompt injection attempts
 */
export function detectPromptInjection(input: string): boolean {
    if (typeof input !== "string") return false;

    return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check for NoSQL injection attempts
 */
export function detectNoSQLInjection(input: string): boolean {
    if (typeof input !== "string") return false;

    return NOSQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check for path traversal attempts
 */
export function detectPathTraversal(input: string): boolean {
    if (typeof input !== "string") return false;

    return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === "string") {
        return sanitizeInput(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
    }

    if (typeof obj === "object") {
        const sanitized: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            // Don't allow keys starting with $ (MongoDB operators)
            if (!key.startsWith("$")) {
                sanitized[sanitizeInput(key)] = sanitizeObject(value);
            }
        }
        return sanitized;
    }

    return obj;
}

/**
 * Middleware: Validate and sanitize request body
 */
export function validateRequestBody(req: Request, res: Response, next: NextFunction) {
    if (req.body) {
        // Check for injection attempts
        const bodyStr = JSON.stringify(req.body);

        if (detectNoSQLInjection(bodyStr)) {
            return res.status(400).json({ error: "Invalid request" });
        }

        if (detectPathTraversal(bodyStr)) {
            return res.status(400).json({ error: "Invalid request" });
        }

        // Sanitize body
        req.body = sanitizeObject(req.body);
    }

    next();
}

/**
 * Middleware: Validate GraphQL queries
 */
export function validateGraphQLQuery(req: Request, res: Response, next: NextFunction) {
    if (req.body?.query) {
        const query = req.body.query;

        // Block introspection in production
        if (process.env.NODE_ENV === "production") {
            if (query.includes("__schema") || query.includes("__type")) {
                return res.status(400).json({ error: "Introspection disabled" });
            }
        }

        // Check query depth (prevent DoS)
        const depth = (query.match(/{/g) || []).length;
        if (depth > 10) {
            return res.status(400).json({ error: "Query too complex" });
        }
    }

    next();
}

/**
 * Validate user query for prompt injection before sending to LLM
 */
export function sanitizeUserQuery(userInput: string): { safe: boolean; sanitized: string; warning?: string } {
    const sanitized = sanitizeInput(userInput);

    if (detectPromptInjection(sanitized)) {
        return {
            safe: false,
            sanitized: "",
            warning: "Query contains blocked patterns"
        };
    }

    // Add safety wrapper for LLM
    const safeQuery = sanitized
        .replace(/\n{3,}/g, "\n\n")  // Limit newlines
        .substring(0, 5000);  // Limit length

    return {
        safe: true,
        sanitized: safeQuery
    };
}

/**
 * Validate file upload
 */
export function validateFileUpload(file: Express.Multer.File): { valid: boolean; error?: string } {
    const allowedMimes = [
        "application/pdf",
        "text/csv",
        "application/json",
        "text/plain",
        "image/png",
        "image/jpeg",
        "image/webp",
    ];

    // Check MIME type
    if (!allowedMimes.includes(file.mimetype)) {
        return { valid: false, error: "File type not allowed" };
    }

    // Check file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
        return { valid: false, error: "File too large" };
    }

    // Check filename for path traversal
    if (detectPathTraversal(file.originalname)) {
        return { valid: false, error: "Invalid filename" };
    }

    // Validate file content type matches extension
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    const mimeToExt: Record<string, string[]> = {
        "application/pdf": ["pdf"],
        "text/csv": ["csv"],
        "application/json": ["json"],
        "text/plain": ["txt", "text"],
        "image/png": ["png"],
        "image/jpeg": ["jpg", "jpeg"],
        "image/webp": ["webp"],
    };

    if (ext && mimeToExt[file.mimetype] && !mimeToExt[file.mimetype].includes(ext)) {
        return { valid: false, error: "File extension mismatch" };
    }

    return { valid: true };
}
