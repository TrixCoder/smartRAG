# SmartRAG

An intelligent Retrieval-Augmented Generation system that automatically selects the best strategy for your data.

## ✨ Features

- **Intelligent RAG Routing** - Automatically selects GraphRAG, Vector, or Agentic strategy based on your query
- **Multi-Database Storage** - MongoDB for documents, Neo4j for knowledge graphs
- **CSV/JSON Analysis** - Automatic schema extraction and entity detection
- **Knowledge Graph Visualization** - Interactive force-directed graph of your data
- **Markdown Chat** - Beautifully formatted responses with typing effect
- **LLM Powered** - Advanced language model integration

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│     Backend     │────▶│   Databases     │
│   (Next.js)     │     │ (Apollo/Express)│     │ MongoDB + Neo4j │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                      │
         │                      ▼
         │              ┌─────────────────┐
         └─────────────▶│    LLM API      │
                        └─────────────────┘
```

## 📦 Installation

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Neo4j (optional, for graph features)
- LLM API key

### 1. Clone the repository

```bash
git clone https://github.com/TrixCoder/smartRAG.git
cd smartRAG
```

### 2. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Configure environment

Create `backend/.env`:

```env
LLM_API_KEY=your_api_key
DATABASE_URL=mongodb://localhost:27017/smartrag
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

### 4. Start the servers

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 5. Open the app

Visit [http://localhost:3000](http://localhost:3000)

## 🚀 Usage

### Upload Data

1. Click the upload icon or drag-and-drop files
2. Supported: CSV, JSON, TXT, PDF, images
3. Data is automatically parsed and entities extracted

### Ask Questions

```
"Find relations in my data"
"Summarize the products by category"
"What are the top 5 brands by price?"
```

### View Knowledge Graph

Click "Knowledge Graph" to see:
- Files as nodes
- Extracted entities connected
- Relationships between data points

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, Apollo Client, Framer Motion |
| Backend | Node.js, Apollo Server, Express |
| AI | Advanced LLM |
| Database | MongoDB, Neo4j |
| Styling | Tailwind CSS, shadcn/ui |

## 📁 Project Structure

```
smartRAG/
├── frontend/
│   ├── app/              # Next.js pages
│   ├── components/       # React components
│   └── lib/              # Apollo client, utils
├── backend/
│   ├── src/
│   │   ├── db/           # MongoDB models
│   │   ├── graphql/      # Schema & resolvers
│   │   └── services/     # AI, Neo4j, RAG strategies
│   └── .env.example
└── README.md
```

## 🔧 RAG Strategies

| Strategy | Use Case |
|----------|----------|
| **GraphRAG** | Relational data, entity networks, "how is A related to B" |
| **Advanced** | Document summarization, content retrieval |
| **Agentic** | Multi-step tasks, "compare X then calculate Y" |

## 📄 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

Built with ❤️