import { useState, useEffect, useRef } from "react";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  contexts?: any[] | undefined;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'knowledge-base' | 'settings'>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(`Rules: 1) Project-only mode. Answer strictly from retrieved passages. 2) Cite like [1], [2] matching the provided context blocks. 3) If insufficient, say "Insufficient corpus" and what tag is missing. 4) Solve via constraint-first lens (pricing → retention → offers → nurture). 5) Prefer concrete steps, scripts, metrics. No hallucinated numbers.`);
  
  // Document management state
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [documentStatus, setDocumentStatus] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load chat history from localStorage on component mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('chatHistory');
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    }
  }, []);

  // Save chat history to localStorage whenever messages change
  useEffect(() => {
    localStorage.setItem('chatHistory', JSON.stringify(messages));
  }, [messages]);

  // Load documents when Knowledge Base tab is active
  useEffect(() => {
    if (activeTab === 'knowledge-base') {
      loadDocuments();
      loadDocumentStatus();
    }
  }, [activeTab]);

  const addMessage = (role: 'user' | 'assistant', content: string, contexts?: any[]) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
      contexts
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    // Add user message immediately
    addMessage('user', userMessage);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMessage,
          systemPrompt,
          k: 8
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Add assistant response
      addMessage('assistant', data.answer, data.contexts);
    } catch (error) {
      console.error('Error:', error);
      addMessage('assistant', `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem('chatHistory');
  };

  // Document management functions
  const loadDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const response = await fetch('/api/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const loadDocumentStatus = async () => {
    try {
      const response = await fetch('/api/document-status');
      if (response.ok) {
        const data = await response.json();
        setDocumentStatus(data);
      }
    } catch (error) {
      console.error('Failed to load document status:', error);
    }
  };

  const deleteDocument = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(filename);
    try {
      const response = await fetch('/api/delete-document', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename }),
      });

      if (response.ok) {
        // Remove from local state
        setDocuments(docs => docs.filter(doc => doc.name !== filename));
        // Trigger re-ingestion to update the knowledge base
        await fetch('/api/ingest', { method: 'POST' });
      } else {
        const error = await response.json();
        alert(`Failed to delete document: ${error.error}`);
      }
    } catch (error) {
      alert(`Error deleting document: ${error}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const renderChatTab = () => (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <h2 className="text-xl font-semibold">Chat with Your Documents</h2>
        <button
          onClick={clearChat}
          className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
        >
          Clear Chat
        </button>
      </div>

      {/* Messages Container */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ height: 'calc(100vh - 300px)' }}
      >
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg">Start a conversation with your documents!</p>
            <p className="text-sm mt-2">Ask questions about pricing strategies, retention, or any topic covered in your uploaded documents.</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3xl rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                
                                       {/* Show contexts for assistant messages */}
                       {message.role === 'assistant' && message.contexts && message.contexts.length > 0 && (
                         <div className="mt-3 pt-3 border-t border-gray-200">
                           <div className="flex items-center justify-between mb-2">
                             <details className="text-sm flex-1">
                               <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                                 View Sources ({message.contexts.length})
                               </summary>
                               <div className="mt-2 space-y-2">
                                 {message.contexts.map((context, index) => (
                                   <div key={context.id} className="bg-white p-2 rounded border text-xs">
                                     <div className="font-medium text-gray-700">
                                       [{index + 1}] {context.meta?.source} {context.meta?.pageSpan && `(${context.meta.pageSpan})`}
                                     </div>
                                     <div className="text-gray-500 text-xs">
                                       Score: {context.meta?.score} • Tokens: {context.meta?.tokens || 'N/A'}
                                     </div>
                                     <div className="text-gray-600 mt-1">
                                       {context.text.slice(0, 150)}...
                                     </div>
                                   </div>
                                 ))}
                               </div>
                             </details>
                                                              <button
                                   onClick={() => {
                                     if (message.contexts) {
                                       const fullAnswer = `${message.content}\n\nSources:\n${message.contexts.map((c, i) => 
                                         `[${i+1}] ${c.meta?.source} ${c.meta?.pageSpan ? `(${c.meta.pageSpan})` : ''}: ${c.text.slice(0, 100)}...`
                                       ).join('\n')}`;
                                       navigator.clipboard.writeText(fullAnswer);
                                     }
                                   }}
                               className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                               title="Copy answer with citations"
                             >
                               Copy
                             </button>
                           </div>
                         </div>
                       )}
              </div>
            </div>
          ))
        )}
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                <span className="text-gray-600">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-white">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about your documents..."
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );

  const renderKnowledgeBaseTab = () => (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Knowledge Base Management</h2>
      
      {/* File Upload Section */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4">Upload Documents</h3>
        <div className="flex items-center space-x-4">
          <input
            type="file"
            accept=".pdf,.txt,.md"
            multiple
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              if (files.length === 0) return;

              const formData = new FormData();
              files.forEach(file => formData.append('files', file));

              try {
                const response = await fetch('/api/upload', { method: 'POST', body: formData });
                if (response.ok) {
                  alert('Files uploaded successfully! Run ingestion to process them.');
                  // Refresh the document list
                  loadDocuments();
                } else {
                  alert('Upload failed');
                }
              } catch (error) {
                alert('Upload error: ' + error);
              }
            }}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
      </div>

      {/* Document Status Summary */}
      {documentStatus && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
          <h4 className="text-sm font-medium text-blue-900 mb-3">Document Status Overview</h4>
          <div className="grid grid-cols-4 gap-4 text-xs">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">{documentStatus.summary.total}</div>
              <div className="text-blue-700">Total</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{documentStatus.summary.unchanged}</div>
              <div className="text-green-700">Up to Date</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-600">{documentStatus.summary.modified + documentStatus.summary.new}</div>
              <div className="text-yellow-700">Needs Processing</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">{documentStatus.summary.deleted}</div>
              <div className="text-red-700">Deleted</div>
            </div>
          </div>
        </div>
      )}

      {/* Document List */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Uploaded Documents</h3>
          <button
            onClick={loadDocuments}
            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
          >
            Refresh List
          </button>
        </div>
        
        {isLoadingDocs ? (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-sm text-gray-600 mt-2">Loading documents...</p>
          </div>
        ) : documents.length > 0 ? (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.name} className="flex items-center justify-between p-3 bg-white rounded border">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{doc.name}</div>
                  <div className="text-sm text-gray-500">
                    {doc.size} • {doc.type} • Uploaded: {doc.uploaded}
                  </div>
                  {/* Processing status indicator */}
                  {(() => {
                    const needsProcessing = documentStatus?.status?.modified?.includes(doc.name) || 
                                         documentStatus?.status?.new?.includes(doc.name);
                    const isDeleted = documentStatus?.status?.deleted?.includes(doc.name);
                    
                    if (isDeleted) {
                      return (
                        <div className="mt-2 flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full bg-red-400"></div>
                          <span className="text-xs text-red-600">Deleted</span>
                        </div>
                      );
                    } else if (needsProcessing) {
                      return (
                        <div className="mt-2 flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                          <span className="text-xs text-yellow-600">Needs processing</span>
                        </div>
                      );
                    } else {
                      return (
                        <div className="mt-2 flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full bg-green-400"></div>
                          <span className="text-xs text-green-600">Processed</span>
                        </div>
                      );
                    }
                  })()}
                </div>
                <div className="flex items-center space-x-2">
                  {(() => {
                    const needsProcessing = documentStatus?.status?.modified?.includes(doc.name) || 
                                         documentStatus?.status?.new?.includes(doc.name);
                    
                    if (needsProcessing) {
                      return (
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/ingest-single', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ filename: doc.name })
                              });
                              if (response.ok) {
                                alert(`${doc.name} processed successfully!`);
                                // Refresh status after processing
                                loadDocumentStatus();
                              } else {
                                alert('Processing failed');
                              }
                            } catch (error) {
                              alert('Processing error: ' + error);
                            }
                          }}
                          className="px-3 py-1 text-sm text-green-600 hover:text-green-800 hover:bg-green-50 rounded border border-green-200"
                        >
                          Process
                        </button>
                      );
                    }
                    return null;
                  })()}
                  <button
                    onClick={() => deleteDocument(doc.name)}
                    disabled={isDeleting === doc.name}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded disabled:opacity-50"
                  >
                    {isDeleting === doc.name ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={async () => {
                if (confirm('Are you sure you want to delete all documents? This action cannot be undone.')) {
                  for (const doc of documents) {
                    await deleteDocument(doc.name);
                  }
                }
              }}
              className="w-full mt-4 px-4 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded border border-red-200"
            >
              Clear All Documents
            </button>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No documents uploaded yet.</p>
            <p className="text-sm mt-1">Upload PDF, TXT, or MD files above to get started.</p>
          </div>
        )}
      </div>

      {/* Document Status */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Document Status</h3>
          <div className="flex space-x-2">
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/api/analyze');
                  if (response.ok) {
                    const data = await response.json();
                    alert(`Document Analysis:\n\nTotal chunks: ${data.analysis.totalChunks}\nAverage chunk size: ${data.analysis.averageChunkSize} characters\nSources: ${data.analysis.sources.join(', ')}\nTags: ${Object.entries(data.analysis.tags).map(([tag, count]) => `${tag}(${count})`).join(', ')}`);
                  } else {
                    alert('Analysis failed');
                  }
                } catch (error) {
                  alert('Analysis error: ' + error);
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Analyze Documents
            </button>
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/api/ingest', { method: 'POST' });
                  if (response.ok) {
                    alert('Documents ingested successfully!');
                  } else {
                    alert('Ingestion failed');
                  }
                } catch (error) {
                  alert('Ingestion error: ' + error);
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Run Ingestion
            </button>
          </div>
        </div>
        
        <div className="text-sm text-gray-600">
          Click "Run Ingestion" to process uploaded documents and make them searchable. Use "Analyze Documents" to see detailed statistics.
        </div>
      </div>
    </div>
  );

  const renderSettingsTab = () => (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>
      
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">System Prompt</span>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="mt-1 block w-full h-40 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your system prompt here..."
          />
        </label>
        
        <div className="text-sm text-gray-600">
          This prompt defines how the AI should behave when answering questions. It will be applied to all conversations.
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">Local Business Playbook RAG</h1>
            <div className="text-sm text-gray-500">
              Powered by Local AI
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto flex h-screen">
        {/* Sidebar */}
        <div className={`bg-white shadow-sm transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}>
          <div className="p-4">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d={sidebarCollapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7m8 14l-7-7 7-7"} />
              </svg>
            </button>
          </div>
          
          <nav className="space-y-2 px-4">
            <button
              onClick={() => setActiveTab('chat')}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                activeTab === 'chat' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={sidebarCollapsed ? 'Chat' : undefined}
            >
              {sidebarCollapsed ? (
                <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              ) : (
                <>
                  <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Chat
                </>
              )}
            </button>
            
            <button
              onClick={() => setActiveTab('knowledge-base')}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                activeTab === 'knowledge-base' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={sidebarCollapsed ? 'Knowledge Base' : undefined}
            >
              {sidebarCollapsed ? (
                <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              ) : (
                <>
                  <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Knowledge Base
                </>
              )}
            </button>
            
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                activeTab === 'settings' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={sidebarCollapsed ? 'Settings' : undefined}
            >
              {sidebarCollapsed ? (
                <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ) : (
                <>
                  <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </>
              )}
            </button>
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-white">
          {activeTab === 'chat' && renderChatTab()}
          {activeTab === 'knowledge-base' && renderKnowledgeBaseTab()}
          {activeTab === 'settings' && renderSettingsTab()}
        </div>
      </div>
    </div>
  );
}
