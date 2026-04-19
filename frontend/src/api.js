/**
 * api.js — централизованный клиент для всех запросов к бэкенду.
 *
 * Используется в AgentPanel.jsx и GraphPanel.jsx.
 * Все URL берутся из одного места — легко менять если порт или хост изменится.
 */

const API_BASE = "http://localhost:8000";

/**
 * Отправляет вопрос в RAG агент и возвращает ответ + источники.
 * @param {string} query - вопрос пользователя
 * @returns {Promise<{question, answer, model, sources}>}
 */
export async function fetchRagAnswer(query) {
  const url = `${API_BASE}/api/agent?q=${encodeURIComponent(query)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.detail || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return response.json();
}

/**
 * Загружает данные графа связей.
 * @param {string} mode - "institutions" | "topics"
 * @param {number} minProjects - минимальное количество проектов для узла
 * @param {number} limit - максимальное количество узлов
 * @returns {Promise<{mode, nodes, edges, node_count, edge_count}>}
 */
export async function fetchGraphData(mode = "institutions", minProjects = 10, limit = 100) {
  const url = `${API_BASE}/api/graph?mode=${mode}&min_projects=${minProjects}&limit=${limit}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Загружает полную карточку одного проекта по регистрационному номеру.
 * @param {string} registrationNumber
 * @returns {Promise<Object>}
 */
export async function fetchProjectDetails(registrationNumber) {
  const url = `${API_BASE}/api/projects/${encodeURIComponent(registrationNumber)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Семантический поиск по смыслу запроса (pgvector).
 * @param {string} query - поисковый запрос
 * @param {number} limit - количество результатов
 * @returns {Promise<{query, results}>}
 */
export async function fetchSemanticSearch(query, limit = 10) {
  const url = `${API_BASE}/api/search/semantic?q=${encodeURIComponent(query)}&limit=${limit}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }

  return response.json();
}
