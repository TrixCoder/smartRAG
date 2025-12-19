import neo4j, { Driver, Session } from "neo4j-driver";
import dotenv from "dotenv";

dotenv.config();

let driver: Driver | null = null;

/**
 * Neo4j Service - handles graph database operations
 * Following official neo4j-driver docs
 */
export const Neo4jService = {
    /**
     * Connect to Neo4j database
     */
    async connect(): Promise<void> {
        const URI = process.env.NEO4J_URI;
        const USER = process.env.NEO4J_USER;
        const PASSWORD = process.env.NEO4J_PASSWORD;

        if (!URI || !USER || !PASSWORD) {
            console.warn("⚠️ Neo4j credentials not configured. Graph features disabled.");
            return;
        }

        try {
            driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
            const serverInfo = await driver.getServerInfo();
            console.log("✅ Neo4j connected:", serverInfo.address);
        } catch (error) {
            console.error("❌ Neo4j connection failed:", error);
            driver = null;
        }
    },

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return driver !== null;
    },

    /**
     * Get a session
     */
    getSession(): Session | null {
        if (!driver) return null;
        return driver.session({ database: "neo4j" });
    },

    /**
     * Execute a Cypher query
     */
    async executeQuery(cypher: string, params: Record<string, any> = {}): Promise<any[]> {
        if (!driver) {
            console.warn("Neo4j not connected");
            return [];
        }

        try {
            const { records, summary } = await driver.executeQuery(
                cypher,
                params,
                { database: "neo4j" }
            );

            console.log(`Query executed in ${summary.resultAvailableAfter}ms`);
            return records;
        } catch (error) {
            console.error("Neo4j query error:", error);
            throw error;
        }
    },

    /**
     * Create entity nodes from extracted data
     */
    async createEntities(entities: Array<{ name: string; type: string; properties?: Record<string, any> }>): Promise<number> {
        if (!driver || entities.length === 0) return 0;

        let created = 0;
        const session = this.getSession();
        if (!session) return 0;

        try {
            for (const entity of entities) {
                const result = await session.run(
                    `MERGE (e:Entity {name: $name})
                     ON CREATE SET e.type = $type, e.createdAt = datetime()
                     ON MATCH SET e.updatedAt = datetime()
                     SET e += $properties
                     RETURN e`,
                    {
                        name: entity.name,
                        type: entity.type,
                        properties: entity.properties || {}
                    }
                );
                created += result.summary.counters.updates().nodesCreated;
            }
            return created;
        } finally {
            await session.close();
        }
    },

    /**
     * Create relationships between entities
     */
    async createRelationships(relationships: Array<{ from: string; to: string; type: string; properties?: Record<string, any> }>): Promise<number> {
        if (!driver || relationships.length === 0) return 0;

        let created = 0;
        const session = this.getSession();
        if (!session) return 0;

        try {
            for (const rel of relationships) {
                const cypher = `
                    MATCH (a:Entity {name: $from})
                    MATCH (b:Entity {name: $to})
                    MERGE (a)-[r:${rel.type.toUpperCase().replace(/\s+/g, "_")}]->(b)
                    ON CREATE SET r.createdAt = datetime()
                    RETURN r
                `;
                const result = await session.run(cypher, {
                    from: rel.from,
                    to: rel.to
                });
                created += result.summary.counters.updates().relationshipsCreated;
            }
            return created;
        } finally {
            await session.close();
        }
    },

    /**
     * Get all entities and relationships for visualization
     */
    async getGraph(): Promise<{ nodes: any[]; links: any[] }> {
        if (!driver) return { nodes: [], links: [] };

        try {
            const nodesResult = await this.executeQuery(`
                MATCH (e:Entity)
                RETURN e.name AS name, e.type AS type, labels(e) AS labels
                LIMIT 100
            `);

            const relsResult = await this.executeQuery(`
                MATCH (a:Entity)-[r]->(b:Entity)
                RETURN a.name AS from, type(r) AS type, b.name AS to
                LIMIT 200
            `);

            const nodes = nodesResult.map((r, i) => ({
                id: `neo4j-${i}`,
                name: r.get("name"),
                type: r.get("type") || "Entity",
                val: 8
            }));

            const links = relsResult.map(r => ({
                source: `neo4j-${nodesResult.findIndex(n => n.get("name") === r.get("from"))}`,
                target: `neo4j-${nodesResult.findIndex(n => n.get("name") === r.get("to"))}`,
                label: r.get("type")
            }));

            return { nodes, links };
        } catch (error) {
            console.error("Error fetching graph:", error);
            return { nodes: [], links: [] };
        }
    },

    /**
     * Close connection
     */
    async close(): Promise<void> {
        if (driver) {
            await driver.close();
            driver = null;
        }
    }
};
