# biz-playbook-rag

Local, privacy-first RAG you can run on a laptop.
- Hybrid retrieval (semantic vectors + keyword) with normalized scoring
- Token-aware chunking + overlap
- Checksum-based re-ingest (only changed files)
- Citations with source + chunk info
- Minimal UI: upload docs, tweak system prompt, copy answer with citations
- Runs offline with Ollama (or switch to an API model if you want)

## Quickstart
```bash
git clone https://github.com/<yourname>/biz-playbook-rag.git
cd biz-playbook-rag
npm install
cp .env.example .env.local   # optional
mkdir docs data              # put your PDFs/TXT into ./docs
npm run ingest               # builds the index
npm run dev                  # open http://localhost:3000 (or use -p 3001)
```
