// App JavaScript for "El Oráculo de los 7 (Value Investors)"

// --- STATE MANAGEMENT ---
let activeChatId = null;
let isGenerating = false;
let abortController = null;
let currentPipelineData = null; // Stored Capa 0 and subagents JSON outputs

const DEFAULT_ORCHESTRATOR_PROMPT = `Eres el Orquestador del "Council of 7 Investors". Tu trabajo es tomar un activo financiero o cartera, analizar la información unificada de la Capa 0 (datos de mercado y perfil) junto con los veredictos individuales de 7 inversores expertos, y generar una síntesis consolidada, analítica y accionable.

Sigue rigurosamente estas pautas para la Síntesis:
1. Identifica el nivel de convergencia (ej. "5 de 7 coinciden en esperar").
2. Nombra y profundiza en las discrepancias reales y argumentadas entre expertos (por qué tensionan sus modelos, ej. Graham vs. Marks).
3. Declara los puntos ciegos que ningún framework cubre para el activo analizado.
4. Genera un veredicto consolidado claro con sugerencia de posicionamiento o rebalanceo.
Utiliza formato Markdown impecable, con tablas comparativas y un tono profesional y analítico.`;

const INVESTORS_LIST = [
    {
        id: 'fisher',
        name: 'Philip Fisher',
        skillPath: 'skills/book-fisher-common-stocks-and-uncommon-profits/SKILL.md',
        fallbackPrompt: `Actúa como Philip Fisher. Evalúa la calidad cualitativa (Scuttlebutt, las 4 Dimensiones de Inversión Conservadora, excelencia de management, pricing power). 
Si el activo es una criptomoneda, commodity o activo especulativo sin flujo de caja o management corporativo, debes dictaminar "applicable: false" con veredicto "No aplica" y justificarlo.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": false,
  "verdict": "No aplica",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'graham',
        name: 'Benjamin Graham',
        skillPath: 'skills/book-graham-el-inversor-inteligente/SKILL.md',
        fallbackPrompt: `Actúa como Benjamin Graham. Evalúa bajo el concepto de Inversión vs Especulación (análisis exhaustivo, seguridad del principal y rendimiento adecuado). Determina si el precio de hoy representa a Mr. Market en pánico o euforia.
Si el activo no tiene activos tangibles o flujos históricos predecibles (como criptomonedas), determina "applicable: false" o califícalo claramente como Especulación Pura con veredicto "No comprar" indicando que no califica como inversión.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": true,
  "verdict": "Comprar" | "No comprar" | "Esperar",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'dodd',
        name: 'Graham & Dodd',
        skillPath: 'skills/book-graham-security-analysis/SKILL.md',
        fallbackPrompt: `Actúa como Graham & Dodd. Evalúa el Valor Intrínseco Contable (valor de liquidación net-net, earnings power normalizado).
Si el activo no tiene balance contable (ej. Bitcoin, oro), debes dictaminar "applicable: false" con veredicto "No aplica" indicando que el balance contable es inexistente.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": false,
  "verdict": "No aplica",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'klarman',
        name: 'Seth Klarman',
        skillPath: 'skills/book-klarman-margin-of-safety/SKILL.md',
        fallbackPrompt: `Actúa como Seth Klarman. Evalúa el margen de seguridad absoluto y el nivel de efectivo (cash) de la cartera. Prioriza la preservación del capital nominal por encima de vencer al índice.
Si la cartera está 100% invertida sin efectivo, sé directo y critícalo.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": true,
  "verdict": "Comprar" | "No comprar" | "Esperar" | "Reducir",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'lynch',
        name: 'Peter Lynch',
        skillPath: 'skills/book-lynch-un-paso-por-delante-de-wall-street/SKILL.md',
        fallbackPrompt: `Actúa como Peter Lynch. Clasifica el activo en una de las 6 categorías (Slow Grower, Stalwart, Fast Grower, Cyclical, Turnaround, Asset Play) o categoría especulativa. Evalúa el PEG (Crecimiento vs PER) y deuda neta.
Si el activo no tiene beneficios (PER) o crecimiento medible (como BTC), clasifícalo como Especulativo y detalla por qué no se puede calcular un PEG.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": true,
  "verdict": "Comprar" | "No comprar" | "Esperar",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'marks',
        name: 'Howard Marks',
        skillPath: 'skills/book-marks-the-most-important-thing/SKILL.md',
        fallbackPrompt: `Actúa como Howard Marks. Aplica Pensamiento de Segundo Nivel y evalúa en qué punto del ciclo de mercado y péndulo de riesgo nos encontramos. Evalúa qué cree el consenso y cuál es la apuesta contraria racional.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": true,
  "verdict": "Comprar" | "No comprar" | "Esperar" | "Reducir",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'thorndike',
        name: 'William Thorndike',
        skillPath: 'skills/book-thorndike-the-outsiders/SKILL.md',
        fallbackPrompt: `Actúa como William Thorndike. Evalúa desde la Asignación Racional de Capital. Analiza el costo de oportunidad de destinar capital marginal a este activo frente a otras opciones (como cash o activos existentes).
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": true,
  "verdict": "Comprar" | "No comprar" | "Esperar" | "Reducir",
  "rationale": "...",
  "watch_metric": "..."
}`
    }
];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initSettings();
    initTheme();
    loadConversationsList();
    setupTextareaAutoResize();
    setupAccordionListener();
    
    // Welcome input focus
    const welcomeInput = document.getElementById('welcome-input');
    if (welcomeInput) welcomeInput.focus();
});

// --- SETTINGS MANAGEMENT ---
function initSettings() {
    const model = localStorage.getItem('oracle_model') || 'gemini-2.5-flash';
    document.getElementById('settings-model').value = model;
    
    const systemPrompt = localStorage.getItem('oracle_system_prompt') || DEFAULT_ORCHESTRATOR_PROMPT;
    document.getElementById('settings-system-prompt').value = systemPrompt;

    const theme = localStorage.getItem('oracle_theme') || 'theme-dark';
    document.getElementById('settings-theme').value = theme;
}

function initTheme() {
    const theme = localStorage.getItem('oracle_theme') || 'theme-dark';
    document.body.className = theme;
}

function changeTheme(themeName) {
    document.body.className = themeName;
}

function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function saveSettings() {
    const model = document.getElementById('settings-model').value;
    const theme = document.getElementById('settings-theme').value;
    const systemPrompt = document.getElementById('settings-system-prompt').value.trim();
    
    localStorage.setItem('oracle_model', model);
    localStorage.setItem('oracle_theme', theme);
    localStorage.setItem('oracle_system_prompt', systemPrompt);
    
    closeSettings();
    changeTheme(theme);
    showStatusNotification("Ajustes guardados correctamente");
}

function togglePasswordVisibility(id) {
    const input = document.getElementById(id);
    const eye = document.getElementById(id + '-eye');
    if (input.type === 'password') {
        input.type = 'text';
        eye.classList.remove('fa-eye');
        eye.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        eye.classList.remove('fa-eye-slash');
        eye.classList.add('fa-eye');
    }
}

// --- CONVERSATION & LOCALSTORAGE HISTORY ---
function getConversations() {
    const raw = localStorage.getItem('oracle_investor_chats');
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

function saveConversations(conversations) {
    localStorage.setItem('oracle_investor_chats', JSON.stringify(conversations));
}

function loadConversationsList() {
    const conversations = getConversations();
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';
    
    const keys = Object.keys(conversations).sort((a, b) => b - a);
    
    if (keys.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No hay consultas guardadas</div>';
        return;
    }
    
    keys.forEach(id => {
        const chat = conversations[id];
        const item = document.createElement('div');
        item.className = `history-item ${activeChatId == id ? 'active' : ''}`;
        item.setAttribute('onclick', `selectConversation('${id}')`);
        
        item.innerHTML = `
            <span class="history-item-title" title="${chat.title}">${chat.title}</span>
            <button class="history-item-delete" onclick="deleteConversation(event, '${id}')">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        historyList.appendChild(item);
    });
}

function startNewChat() {
    if (isGenerating) return;
    activeChatId = null;
    currentPipelineData = null;
    
    document.getElementById('view-chat').style.display = 'none';
    document.getElementById('view-welcome').style.display = 'flex';
    document.getElementById('btn-open-audit').style.display = 'none';
    document.getElementById('audit-panel').style.display = 'none';
    
    document.getElementById('welcome-input').value = '';
    document.getElementById('chat-textarea').value = '';
    document.getElementById('chat-feed').innerHTML = '';
    
    loadConversationsList();
    document.getElementById('sidebar').classList.remove('open');
    
    setTimeout(() => {
        document.getElementById('welcome-input').focus();
    }, 50);
}

function selectConversation(id) {
    if (isGenerating) return;
    activeChatId = id;
    
    const conversations = getConversations();
    const chat = conversations[id];
    if (!chat) return;
    
    document.getElementById('view-welcome').style.display = 'none';
    document.getElementById('view-chat').style.display = 'flex';
    document.getElementById('chat-header-title').innerText = chat.title;
    
    // Load feed
    const feed = document.getElementById('chat-feed');
    feed.innerHTML = '';
    chat.messages.forEach((msg, idx) => {
        const isLastAI = (msg.role === 'model' && idx === chat.messages.length - 1);
        renderMessage(msg.role, msg.content, false, isLastAI);
    });
    
    // Load pipeline metadata
    if (chat.pipelineData) {
        currentPipelineData = chat.pipelineData;
        populateAuditPanel(chat.pipelineData);
        document.getElementById('btn-open-audit').style.display = 'flex';
    } else {
        currentPipelineData = null;
        document.getElementById('btn-open-audit').style.display = 'none';
        document.getElementById('audit-panel').style.display = 'none';
    }
    
    loadConversationsList();
    scrollToBottom();
    document.getElementById('sidebar').classList.remove('open');
}

function deleteConversation(event, id) {
    event.stopPropagation();
    if (isGenerating && activeChatId == id) return;
    
    if (confirm("¿Eliminar este análisis del historial?")) {
        const conversations = getConversations();
        delete conversations[id];
        saveConversations(conversations);
        
        if (activeChatId == id) {
            startNewChat();
        } else {
            loadConversationsList();
        }
    }
}

function clearAllHistory() {
    if (isGenerating) return;
    if (confirm("¿Borrar todo el historial de análisis?")) {
        saveConversations({});
        startNewChat();
    }
}

function saveActiveChatToStorage(messages, pipelineData = null) {
    if (!activeChatId) {
        activeChatId = Date.now().toString();
    }
    
    const conversations = getConversations();
    let title = "Nueva deliberación";
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
        title = firstUserMsg.content;
        if (title.length > 30) {
            title = title.substring(0, 27) + '...';
        }
    }
    
    // Maintain pipelineData if not provided on follow-ups
    const existingChat = conversations[activeChatId];
    const savedPipelineData = pipelineData || (existingChat ? existingChat.pipelineData : null);
    
    conversations[activeChatId] = {
        title: title,
        messages: messages,
        pipelineData: savedPipelineData
    };
    
    saveConversations(conversations);
    loadConversationsList();
    document.getElementById('chat-header-title').innerText = title;
}

// --- RENDER FUNCTIONS ---
function renderMessage(role, content, animate = true, isLastAI = false) {
    const feed = document.getElementById('chat-feed');
    const container = document.createElement('div');
    container.className = `msg-container ${role}`;
    
    if (!animate) {
        container.style.animation = 'none';
    }
    
    const avatar = role === 'user' ? 'Tú' : 'O';
    const avatarClass = role === 'user' ? 'user' : 'ai';
    const formattedContent = role === 'user' ? escapeHTML(content) : marked.parse(content);
    
    if (role === 'model') {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = `msg-avatar ${avatarClass}`;
        avatarDiv.innerText = avatar;
        container.appendChild(avatarDiv);
    }
    
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'msg-body';
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'msg-bubble';
    bubbleDiv.innerHTML = formattedContent;
    bodyDiv.appendChild(bubbleDiv);
    
    if (role === 'model') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'msg-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'msg-action-btn';
        copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar';
        copyBtn.addEventListener('click', () => copyMessageText(copyBtn, content));
        actionsDiv.appendChild(copyBtn);
        
        if (isLastAI) {
            const regenBtn = document.createElement('button');
            regenBtn.className = 'msg-action-btn';
            regenBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Volver a deliberar';
            regenBtn.addEventListener('click', () => regenerateLastResponse());
            actionsDiv.appendChild(regenBtn);
        }
        
        bodyDiv.appendChild(actionsDiv);
    }
    
    container.appendChild(bodyDiv);
    
    if (role === 'user') {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = `msg-avatar ${avatarClass}`;
        avatarDiv.innerText = avatar;
        container.appendChild(avatarDiv);
    }
    
    feed.appendChild(container);
    scrollToBottom();
}

function copyMessageText(button, text) {
    navigator.clipboard.writeText(text).then(() => {
        const original = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-check"></i> Copiado';
        setTimeout(() => button.innerHTML = original, 2000);
    }).catch(err => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        const original = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-check"></i> Copiado';
        setTimeout(() => button.innerHTML = original, 2000);
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function scrollToBottom() {
    const feed = document.getElementById('chat-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
}

function showStatusNotification(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerText = message;
    
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: 'var(--bg-panel)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--border-radius-md)',
        padding: '12px 20px',
        fontSize: '14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        zIndex: '9999',
        fontFamily: 'var(--font-sans)',
        fontWeight: '500',
        transition: 'opacity 0.3s ease'
    });
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 350);
    }, 2000);
}

// --- PIPELINE STEP HUD ---
function updateHUDStep(stepIndex, status) {
    // stepIndex: 0 (Capa 0), 1 (Subagentes), 2 (Síntesis)
    // status: 'pending', 'active', 'completed', 'error'
    const stepEl = document.getElementById(`hud-step-${stepIndex}`);
    if (!stepEl) return;
    
    stepEl.className = `hud-step ${status}`;
    const iconEl = stepEl.querySelector('.step-icon');
    
    if (status === 'active') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    } else if (status === 'completed') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    } else if (status === 'error') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-exclamation text-danger"></i>';
    } else {
        iconEl.innerHTML = '<i class="fa-solid fa-clock"></i>';
    }
}

function updateHUDBadge(agentId, status) {
    // status: 'pending', 'analyzing', 'completed', 'error'
    const badge = document.getElementById(`badge-${agentId}`);
    if (!badge) return;
    badge.className = `badge-subagent ${status}`;
}

// --- AUDIT PANEL DRAWER ---
function toggleAuditPanel() {
    const panel = document.getElementById('audit-panel');
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
    } else {
        panel.style.display = 'none';
    }
}

function setupAccordionListener() {
    document.getElementById('audit-accordion').addEventListener('click', (e) => {
        const header = e.target.closest('.accordion-trigger');
        if (!header) return;
        const item = header.closest('.accordion-item');
        item.classList.toggle('active');
    });
}

function populateAuditPanel(pipelineData) {
    if (!pipelineData) return;
    
    // 1. Capa 0 JSON
    document.getElementById('audit-capa0-json').innerText = JSON.stringify(pipelineData.capa0, null, 2);
    
    // 2. Accordion subagents
    const container = document.getElementById('audit-accordion');
    container.innerHTML = '';
    
    INVESTORS_LIST.forEach(inv => {
        const res = pipelineData.subagents[inv.id];
        if (!res) return;
        
        const isApp = res.applicable;
        const verdict = res.verdict || "No aplica";
        const verdictClass = verdict.toLowerCase().replace(/\s+/g, '-');
        
        const item = document.createElement('div');
        item.className = 'accordion-item';
        
        item.innerHTML = `
            <button class="accordion-trigger">
                <div class="accordion-trigger-info">
                    <strong>${inv.name}</strong>
                    <span class="verdict-pill ${verdictClass}">${verdict}</span>
                </div>
                <i class="fa-solid fa-chevron-down accordion-icon"></i>
            </button>
            <div class="accordion-content">
                <div class="accordion-inner">
                    <div class="inner-row">
                        <strong>Aplicable</strong>
                        <p>${isApp ? 'Sí' : 'No'}</p>
                    </div>
                    <div class="inner-row">
                        <strong>Razón / Análisis</strong>
                        <p>${res.rationale || 'N/A'}</p>
                    </div>
                    <div class="inner-row">
                        <strong>Métrica a Monitorear</strong>
                        <p>${res.watch_metric || 'N/A'}</p>
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(item);
    });
}

// --- UTILITY FETCH SKILLS (Progressive Disclosure) ---
async function fetchSkillContent(skillPath, fallback) {
    try {
        const response = await fetch(skillPath);
        if (!response.ok) throw new Error();
        return await response.text();
    } catch (e) {
        // Fallback if local file:// blocks fetch or not found
        return fallback;
    }
}

// --- CORE AGENTIC PIPELINE (Map-Reduce) ---
async function executeChatRequest(query) {
    if (isGenerating) return;
    
    // Toggle active inputs
    isGenerating = true;
    document.getElementById('btn-send').style.display = 'none';
    document.getElementById('btn-stop').style.display = 'flex';
    document.getElementById('chat-textarea').disabled = true;
    
    // Clear feed if first query of welcome view
    const welcomeView = document.getElementById('view-welcome');
    if (welcomeView.style.display !== 'none') {
        welcomeView.style.display = 'none';
        document.getElementById('view-chat').style.display = 'flex';
        document.getElementById('chat-feed').innerHTML = '';
    }
    
    // Add user message to UI
    renderMessage('user', query, true, false);
    
    // Show Pipeline HUD
    const hud = document.getElementById('pipeline-hud');
    hud.style.display = 'flex';
    
    // Reset HUD steps
    updateHUDStep(0, 'active');
    updateHUDStep(1, 'pending');
    updateHUDStep(2, 'pending');
    INVESTORS_LIST.forEach(inv => updateHUDBadge(inv.id, 'pending'));
    
    // Start progress HUD step simulation (staggering) to give active feedback
    let simulatedHUDInterval = simulateHUDProgress();
    
    abortController = new AbortController();
    
    try {
        const response = await fetch('/api/deliberate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query }),
            signal: abortController.signal
        });
        
        clearInterval(simulatedHUDInterval);
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json(); // { synthesis, capa0, subagents }
        
        // Mark all steps as complete in HUD
        updateHUDStep(0, 'completed');
        updateHUDStep(1, 'completed');
        updateHUDStep(2, 'completed');
        INVESTORS_LIST.forEach(inv => updateHUDBadge(inv.id, 'completed'));
        
        // Hide HUD after small delay
        setTimeout(() => {
            hud.style.display = 'none';
        }, 600);
        
        // Save history and update UI
        let chatMessages = [];
        if (activeChatId) {
            const conversations = getConversations();
            if (conversations[activeChatId]) chatMessages = [...conversations[activeChatId].messages];
        }
        
        chatMessages.push({ role: 'user', content: query });
        chatMessages.push({ role: 'model', content: data.synthesis });
        
        const pipelineData = {
            capa0: data.capa0,
            subagents: data.subagents
        };
        
        saveActiveChatToStorage(chatMessages, pipelineData);
        
        // Refresh feed
        const feed = document.getElementById('chat-feed');
        feed.innerHTML = '';
        chatMessages.forEach((msg, idx) => {
            const isLastAI = (msg.role === 'model' && idx === chatMessages.length - 1);
            renderMessage(msg.role, msg.content, false, isLastAI);
        });
        
        // Update audit panel drawer
        currentPipelineData = pipelineData;
        populateAuditPanel(pipelineData);
        document.getElementById('btn-open-audit').style.display = 'flex';
        
    } catch (error) {
        clearInterval(simulatedHUDInterval);
        hud.style.display = 'none';
        
        if (error.name === 'AbortError') {
            renderMessage('model', '*(La sesión del consejo fue interrumpida por el usuario)*', true, true);
        } else {
            console.error("Pipeline execution error:", error);
            renderMessage('model', `⚠️ **Error en el Pipeline Agéntico**
            
Ocurrió una falla en la ejecución del consejo de inversores.

* **Detalle del error**: \`${error.message}\`
* Asegúrate de configurar las variables de entorno (\`ANTHROPIC_API_KEY\`, \`SERPER_API_KEY\`, etc.) en tu despliegue de Vercel o en tu archivo \`.env.local\`.`, true, true);
        }
    } finally {
        isGenerating = false;
        abortController = null;
        document.getElementById('btn-stop').style.display = 'none';
        document.getElementById('btn-send').style.display = 'flex';
        document.getElementById('chat-textarea').disabled = false;
        document.getElementById('chat-textarea').focus();
    }
}

function simulateHUDProgress() {
    let elapsed = 0;
    
    const interval = setInterval(() => {
        elapsed += 0.5;
        
        if (elapsed === 1.5) {
            updateHUDStep(0, 'completed');
            updateHUDStep(1, 'active');
        }
        
        // Stagger subagent analysis badges
        if (elapsed >= 2.0 && elapsed < 6.0) {
            const index = Math.floor((elapsed - 2.0) / 0.5);
            if (index < INVESTORS_LIST.length) {
                // Set current to analyzing
                updateHUDBadge(INVESTORS_LIST[index].id, 'analyzing');
                // Set previous to completed
                if (index > 0) {
                    updateHUDBadge(INVESTORS_LIST[index - 1].id, 'completed');
                }
            }
        }
        
        if (elapsed === 6.0) {
            updateHUDBadge(INVESTORS_LIST[INVESTORS_LIST.length - 1].id, 'completed');
            updateHUDStep(1, 'completed');
            updateHUDStep(2, 'active');
        }
    }, 500);
    
    return interval;
}

// --- SUB-TASKS EXECUTION ---

function extractTicker(query) {
    // Regex looking for tickers, usually capitalized 2-5 letter strings, or common words
    const cleaned = query.toUpperCase();
    const commonTickers = ['AAPL', 'MSFT', 'TSLA', 'AMZN', 'YPF', 'BTC', 'ETH', 'KO', 'PEP', 'GGAL', 'ALUA', 'MELI', 'BABA', 'NVDA', 'SPY', 'QQQ'];
    
    for (const tick of commonTickers) {
        if (cleaned.includes(tick)) return tick;
    }
    
    // Fallback regex match for capitalized words
    const matches = query.match(/[A-Z]{2,5}/g);
    if (matches && matches.length > 0) return matches[0];
    
    // Default asset if not detected
    return "ACTIVO INDIVIDUAL";
}

function extractPortfolioContext(query) {
    if (query.toLowerCase().includes("cartera") || query.toLowerCase().includes("portafolio")) {
        // Simple extraction or passing complete query context
        return query;
    }
    return "No especificado (analizando activo de forma aislada).";
}

// Capa 0 Normalizer - Call endpoint or fallback to Gemini 2.5 Flash Scrapper
async function runCapa0Normalizer(ticker, portfolio, apiKey, signal) {
    const model = localStorage.getItem('oracle_model') || 'gemini-2.5-flash';
    
    // Let's first check if serverless endpoint is available
    try {
        const response = await fetch(`/api/normalize?ticker=${ticker}`, { signal });
        if (response.ok) {
            const data = await response.json();
            // Merge portfolio context into state
            data.portfolio_context = portfolio;
            return data;
        }
    } catch (e) {
        // Fallback to Gemini Scraper
    }
    
    // Call Gemini as scrapper/interpolator
    const systemPrompt = `Actúas como el Normalizador de la Capa 0 del consejo de inversores. Tu única misión es proveer datos financieros determinísticos actuales sobre el activo solicitado.
Debes devolver estrictamente un objeto JSON con este formato y nada más (sin bloques de comentarios, markdown, etc.):
{
  "asset": "${ticker}",
  "price": "precio_actual_usd",
  "date": "${new Date().toLocaleDateString()}",
  "ath": "maximo_historico_usd",
  "drawdown_actual": "%_caida_actual_desde_ath",
  "drawdown_historico_max": "%_maxima_caida_historica",
  "regime": "Crecimiento rápido / Estable / Cíclica / Especulativa / Reestructuración",
  "portfolio_context": "${portfolio}"
}`;

    const payload = {
        contents: [{ role: 'user', parts: [{ text: `Entrega el estado financiero de Capa 0 para el ticker ${ticker}.` }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
    };
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
    });
    
    if (!response.ok) throw new Error("Capa 0 Normalizer API Error");
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Clean potential markdown blocks
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
}

// Subagent execution call
async function runSubagentAnalysis(name, skillContent, capa0State, apiKey, signal) {
    const model = localStorage.getItem('oracle_model') || 'gemini-2.5-flash';
    
    const systemPrompt = `Tu instrucción base de rol es:\n${skillContent}\n\nREGLA DE SALIDA IMPERATIVA:
Debes evaluar la Capa 0 e ingresar tu veredicto en formato JSON válido. No escribas prosa antes ni después del JSON. Devuelve exactamente este esquema:
{
  "applicable": true/false,
  "verdict": "Comprar" | "No comprar" | "Esperar" | "Reducir" | "No aplica",
  "rationale": "Análisis resumido en 3-4 líneas aplicando exactamente tu framework y fórmulas",
  "watch_metric": "La métrica específica de tu modelo mental que monitorearías"
}`;

    const payload = {
        contents: [{ role: 'user', parts: [{ text: `Evalúa el siguiente estado de Capa 0:\n${JSON.stringify(capa0State, null, 2)}` }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
    };
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
    });
    
    if (!response.ok) throw new Error(`Subagent ${name} API Error`);
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
}

// Synthesis reduction step
async function runSynthesis(orquestadoraSkill, pipelineData, originalQuery, apiKey, signal) {
    // For Synthesis we prefer using gemini-2.5-pro if selected, otherwise flash
    let model = localStorage.getItem('oracle_model') || 'gemini-2.5-flash';
    
    const payload = {
        contents: [{
            role: 'user', 
            parts: [{ 
                text: `El usuario pregunta: "${originalQuery}"
                
Aquí están los datos estructurados del pipeline agéntico:
${JSON.stringify(pipelineData, null, 2)}` 
            }] 
        }],
        systemInstruction: { parts: [{ text: orquestadoraSkill }] }
    };
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
    });
    
    if (!response.ok) throw new Error("Synthesis (Fan-in) API Error");
    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text;
}

// --- REGENERATE & SUBMITS ---
function submitWelcomeQuery() {
    const input = document.getElementById('welcome-input');
    const query = input.value.trim();
    if (!query) return;
    executeChatRequest(query);
}

function submitChatQuery() {
    if (isGenerating) return;
    const input = document.getElementById('chat-textarea');
    const query = input.value.trim();
    if (!query) return;
    
    input.value = '';
    input.style.height = '24px';
    executeChatRequest(query);
}

function selectSuggestion(query) {
    document.getElementById('welcome-input').value = query;
    submitWelcomeQuery();
}

function stopAIResponse() {
    if (abortController) {
        abortController.abort();
    }
}

async function regenerateLastResponse() {
    if (isGenerating || !activeChatId) return;
    
    const conversations = getConversations();
    const chat = conversations[activeChatId];
    if (!chat || chat.messages.length === 0) return;
    
    // Remove last model message from history
    if (chat.messages[chat.messages.length - 1].role === 'model') {
        chat.messages.pop();
    }
    
    // Clean feed visual of the last message container
    const feed = document.getElementById('chat-feed');
    const containers = feed.querySelectorAll('.msg-container');
    if (containers.length > 0) {
        const lastContainer = containers[containers.length - 1];
        if (lastContainer.classList.contains('model')) {
            lastContainer.remove();
        }
    }
    
    // Re-run execution
    const lastUserQuery = chat.messages[chat.messages.length - 1].content;
    
    // Remove user query temporarily since executeChatRequest will add it again
    chat.messages.pop();
    saveActiveChatToStorage(chat.messages);
    
    executeChatRequest(lastUserQuery);
}

// --- EXPORT TO MD ---
function exportChatMarkdown() {
    if (!activeChatId) return;
    const conversations = getConversations();
    const chat = conversations[activeChatId];
    if (!chat) return;
    
    let markdown = `# Deliberación del Consejo de Inversores: ${chat.title}\n\n`;
    markdown += `*El Oráculo de los 7 (Value Investors)*\n`;
    markdown += `*Fecha: ${new Date().toLocaleString()}*\n\n`;
    markdown += `---\n\n`;
    
    if (chat.pipelineData) {
        markdown += `## 📊 Capa 0 — Datos Normalizados de Mercado\n\n`;
        markdown += `| Métrica | Valor |\n`;
        markdown += `|---|---|\n`;
        markdown += `| **Activo** | ${chat.pipelineData.capa0.asset} |\n`;
        markdown += `| **Precio** | ${chat.pipelineData.capa0.price} |\n`;
        markdown += `| **Fecha de Datos** | ${chat.pipelineData.capa0.date} |\n`;
        markdown += `| **Máximo Histórico (ATH)** | ${chat.pipelineData.capa0.ath} |\n`;
        markdown += `| **Drawdown Actual** | ${chat.pipelineData.capa0.drawdown_actual} |\n`;
        markdown += `| **Drawdown Máximo Histórico** | ${chat.pipelineData.capa0.drawdown_historico_max} |\n`;
        markdown += `| **Régimen del Activo** | ${chat.pipelineData.capa0.regime} |\n\n`;
        markdown += `---\n\n`;
    }
    
    chat.messages.forEach(msg => {
        const sender = msg.role === 'user' ? 'Usuario' : 'Síntesis del Consejo';
        markdown += `### 💬 ${sender}\n\n${msg.content}\n\n---\n\n`;
    });
    
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = chat.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    link.href = url;
    link.download = `oraculo-7-${filename || 'deliberacion'}.md`;
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

// --- UTILITY HANDLERS ---
function toggleSidebarMobile() {
    document.getElementById('sidebar').classList.toggle('open');
}

function setupTextareaAutoResize() {
    const textarea = document.getElementById('chat-textarea');
    if (textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = '24px';
            this.style.height = Math.min(this.scrollHeight, 180) + 'px';
        });
        
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitChatQuery();
            }
        });
    }
    
    const welcomeInput = document.getElementById('welcome-input');
    if (welcomeInput) {
        welcomeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                submitWelcomeQuery();
            }
        });
    }
}
