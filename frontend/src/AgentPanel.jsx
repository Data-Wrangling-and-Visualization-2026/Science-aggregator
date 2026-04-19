/**
 * AgentPanel.jsx
 * 
 * RAG Agent Panel Component
 * 
 * Features:
 * - Pre-fills with project name when a project is selected
 * - Allows custom questions
 * - Shows AI-generated answer using Ollama (llama3.2:3b)
 * - Displays source projects with similarity scores
 * - Error handling for network/timeout issues
 */

import { useEffect, useState } from "react";
import { fetchRagAnswer } from "./api.js";

export default function AgentPanel({ selectedProject }) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState("");
  const [model, setModel] = useState("");

  // When project changes, pre-fill query but don't auto-run
  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    const name = selectedProject.name || selectedProject.registration_number || "";
    const annotation = selectedProject.annotation || "";
    const keywords = selectedProject.keyword_list || "";

    // Build a descriptive prompt
    const prompt = `Analyse the research project: "${name}". 
Budget: ${selectedProject.budget_total_thousands ? (selectedProject.budget_total_thousands / 1000).toFixed(1) + " million RUB" : "unknown"}. 
Year: ${selectedProject.year || "unknown"}.
Institution: ${selectedProject.institution || "unknown"}.
Focus: ${keywords.split(";").slice(0, 3).join(", ") || "general research"}.
What are the key research goals and potential impact?`;

    setQuery(prompt);
    setAnswer("");
    setSources([]);
    setError("");
    setStatus("idle");
  }, [selectedProject]);

  const runAgent = async () => {
    if (!query.trim()) {
      setError("Please enter a question first");
      return;
    }

    setStatus("loading");
    setError("");
    setAnswer("");
    setSources([]);
    setModel("");

    try {
      const data = await fetchRagAnswer(query.trim());
      setAnswer(data.answer || "No answer received");
      setSources(data.sources || []);
      setModel(data.model || "unknown");
      setStatus("done");
    } catch (err) {
      const errorMsg = err.message || "Unknown error";
      if (errorMsg.includes("503")) {
        setError("Ollama service is not available. Make sure Docker containers are running.");
      } else if (errorMsg.includes("504")) {
        setError("Request timeout. Try again with a simpler question.");
      } else if (errorMsg.includes("Embeddings not ready")) {
        setError("Embeddings not ready. Run: python backend/embed.py");
      } else {
        setError(errorMsg);
      }
      setStatus("error");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
      runAgent();
    }
  };

  if (!selectedProject) {
    return null;
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 18,
      padding: "24px 28px",
      marginTop: 20,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 6 }}>
            🤖 AI Assistant (Ollama)
          </div>
          <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 700 }}>
            Analyse Selected Project
          </div>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>
            Ask questions about research goals, budget, methodology, and potential impact
          </div>
        </div>

        <button
          onClick={runAgent}
          disabled={status === "loading" || !query.trim()}
          onKeyDown={handleKeyDown}
          title="Ctrl+Enter to submit"
          style={{
            background: status === "loading" ? "#1e3a5f" : "linear-gradient(135deg,#4f8ef7,#6ee7b7)",
            border: "none",
            color: status === "loading" ? "#475569" : "#fff",
            padding: "10px 20px",
            borderRadius: 12,
            cursor: status === "loading" || !query.trim() ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 600,
            flex: "0 0 auto",
          }}
        >
          {status === "loading" ? "Processing…" : "Run Agent →"}
        </button>
      </div>

      {/* Query textarea */}
      <div style={{ marginTop: 18 }}>
        <label style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>
          Your Question (Ctrl+Enter to submit)
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder="Ask about research goals, budget, impact, methodology..."
          style={{
            width: "100%",
            marginTop: 8,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#0d1526",
            color: "#e2e8f0",
            padding: "12px 14px",
            resize: "vertical",
            fontSize: 13,
            fontFamily: "'IBM Plex Mono', monospace",
            outline: "none",
          }}
          onFocus={(e) => e.target.style.borderColor = "rgba(79,142,247,0.4)"}
          onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
        />
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          marginTop: 14,
          background: "rgba(244, 114, 182, 0.1)",
          border: "1px solid rgba(244, 114, 182, 0.3)",
          color: "#fda4af",
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 12,
          lineHeight: 1.5,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Answer section */}
      {answer && (
        <div style={{ marginTop: 22 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}>
            <div style={{
              color: "#94a3b8",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 1.1,
            }}>
              💡 Agent Response
            </div>
            {model && (
              <span style={{
                color: "#7dd3fc",
                fontSize: 10,
                fontFamily: "monospace",
              }}>
                {model}
              </span>
            )}
          </div>

          <div style={{
            marginTop: 10,
            color: "#cbd5e1",
            fontSize: 13,
            lineHeight: 1.8,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "rgba(255,255,255,0.02)",
            borderRadius: 12,
            padding: "16px 18px",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            {answer}
          </div>
        </div>
      )}

      {/* Sources section */}
      {sources.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{
            color: "#94a3b8",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1.1,
            marginBottom: 12,
          }}>
            📚 Sources ({sources.length})
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
          }}>
            {sources.map((source, idx) => (
              <div
                key={idx}
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "rgba(79,142,247,0.08)",
                  border: "1px solid rgba(79,142,247,0.2)",
                }}
              >
                <div style={{
                  color: "#cbd5e1",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 4,
                }}>
                  {source.name || source.registration_number}
                </div>

                <div style={{
                  color: "#94a3b8",
                  fontSize: 11,
                  lineHeight: 1.5,
                }}>
                  <div>
                    📋 {source.registration_number}
                  </div>
                  <div>
                    📅 {source.year || "—"}
                  </div>
                  <div>
                    🏢 {source.institution ? source.institution.slice(0, 50) : "—"}
                  </div>
                  <div style={{
                    marginTop: 6,
                    padding: "6px 8px",
                    background: "rgba(79,142,247,0.15)",
                    borderRadius: 6,
                    fontSize: 11,
                  }}>
                    Similarity: <span style={{ color: "#4f8ef7", fontWeight: 700 }}>
                      {(Number(source.similarity) || 0).toFixed(3)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
