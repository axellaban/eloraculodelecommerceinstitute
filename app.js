// App JavaScript for "El Oráculo de los 7 (Value Investors)"
// Integrates the mockup transitions, light design, and the agentic pipeline

// --- STATE MANAGEMENT ---
let activeChatId = null;
let isGenerating = false;
let abortController = null;
let currentPipelineData = null; // Stored Capa 0 and subagents JSON outputs

const DEFAULT_ORCHESTRATOR_PROMPT = `Eres el Orquestador del "Council of 7 Investors". Tu trabajo es tomar un activo financiero o cartera, analizar la información unificada de la Capa 0 (datos de mercado y perfil) junto con los veredictos individuales de 7 inversores expertos, y generar una síntesis consolidada, analítica y accionable.

Sigue rigurosamente estas pautas para la Síntesis:
1. Identifica el nivel de convergencia (ej. "5 de 7 coinciden en comprar").
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

// --- DOM ELEMENTS ---
const getDOMElements = () => ({
    mainInput: document.getElementById('query-input'),
    chatInput: document.getElementById('chat-input'),
    chatWindow: document.getElementById('chat-window'),
    mainInterface: document.getElementById('main-interface'),
    chatInterface: document.getElementById('chat-interface'),
    sidebar: document.getElementById('sidebar'),
    btnSend: document.getElementById('btn-send'),
    btnStop: document.getElementById('btn-stop'),
    btnOpenAudit: document.getElementById('btn-open-audit'),
    auditDrawer: document.getElementById('audit-drawer')
});

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initSettings();
    initTheme();
    loadConversationsList();
    setupTextareaAutoResize();
    setupAccordionListener();
    
    // Focus welcome input
    const els = getDOMElements();
    if (els.mainInput) els.mainInput.focus();
});

// --- SETTINGS ---
function initSettings() {
    const model = localStorage.getItem('oracle_model') || 'gemini-2.5-flash';
    document.getElementById('settings-model').value = model;
    
    const systemPrompt = localStorage.getItem('oracle_system_prompt') || DEFAULT_ORCHESTRATOR_PROMPT;
    document.getElementById('settings-system-prompt').value = systemPrompt;

    const theme = localStorage.getItem('oracle_theme') || 'theme-light';
    document.getElementById('settings-theme').value = theme;
}

function initTheme() {
    const theme = localStorage.getItem('oracle_theme') || 'theme-light';
    document.body.className = `flex flex-col items-center justify-center text-gray-800 relative ${theme}`;
}

function changeTheme(themeName) {
    document.body.className = `flex flex-col items-center justify-center text-gray-800 relative ${themeName}`;
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

// --- CONVERSATIONS HISTORY ---
function getConversations() {
    const raw = localStorage.getItem('oracle_investor_chats');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
}

function saveConversations(conversations) {
    localStorage.setItem('oracle_investor_chats', JSON.stringify(conversations));
}

function loadConversationsList() {
    const conversations = getConversations();
    const historyList = document.getElementById('history-list');
    if (!historyList) return;
    
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
    resetUI();
}

function selectConversation(id) {
    if (isGenerating) return;
    activeChatId = id;
    
    const conversations = getConversations();
    const chat = conversations[id];
    if (!chat) return;
    
    const els = getDOMElements();
    
    // Smooth transition to chat interface directly
    els.mainInterface.classList.add('hidden-chat');
    els.chatInterface.classList.remove('hidden-chat');
    els.chatInterface.classList.add('fade-enter-active');
    
    // Set title in header
    els.chatInterface.querySelector('h2').innerText = chat.title;
    
    // Load messages
    els.chatWindow.innerHTML = '';
    chat.messages.forEach((msg, idx) => {
        const isLastAI = (msg.role === 'model' && idx === chat.messages.length - 1);
        renderMessage(msg.role, msg.content, false, isLastAI);
    });
    
    // Load pipeline metadata
    if (chat.pipelineData) {
        currentPipelineData = chat.pipelineData;
        populateAuditPanel(chat.pipelineData);
        els.btnOpenAudit.style.display = 'flex';
    } else {
        currentPipelineData = null;
        els.btnOpenAudit.style.display = 'none';
        els.auditDrawer.style.display = 'none';
    }
    
    loadConversationsList();
    scrollToBottom();
}

function deleteConversation(event, id) {
    event.stopPropagation();
    if (isGenerating && activeChatId == id) return;
    
    if (confirm("¿Eliminar este análisis del historial?")) {
        const conversations = getConversations();
        delete conversations[id];
        saveConversations(conversations);
        
        if (activeChatId == id) {
            resetUI();
        } else {
            loadConversationsList();
        }
    }
}

function clearAllHistory() {
    if (isGenerating) return;
    if (confirm("¿Borrar todo el historial de análisis?")) {
        saveConversations({});
        resetUI();
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
    
    const existingChat = conversations[activeChatId];
    const savedPipelineData = pipelineData || (existingChat ? existingChat.pipelineData : null);
    
    conversations[activeChatId] = {
        title: title,
        messages: messages,
        pipelineData: savedPipelineData
    };
    
    saveConversations(conversations);
    loadConversationsList();
    
    // Update header title in UI
    const els = getDOMElements();
    els.chatInterface.querySelector('h2').innerText = title;
}

// --- MESSAGE RENDERING ---
function renderMessage(role, content, animate = true, isLastAI = false) {
    const els = getDOMElements();
    const container = document.createElement('div');
    container.className = `w-full flex ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    
    const formattedContent = role === 'user' ? escapeHTML(content) : marked.parse(content);
    
    if (role === 'user') {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble p-4 user-msg self-end ml-auto flex flex-col ${animate ? 'msg-enter' : ''}`;
        bubble.innerHTML = `<span class="text-xs font-semibold mb-1 opacity-75 block">Tú</span><p>${formattedContent}</p>`;
        container.appendChild(bubble);
    } else {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble p-4 oracle-msg self-start flex gap-3 w-full ${animate ? 'msg-enter' : ''}`;
        
        let actionsHtml = '';
        if (isLastAI) {
            actionsHtml = `
                <div class="msg-actions">
                    <button class="msg-action-btn" id="copy-btn-msg"><i class="fa-solid fa-copy"></i> Copiar</button>
                    <button class="msg-action-btn" id="regen-btn-msg"><i class="fa-solid fa-arrows-rotate"></i> Volver a deliberar</button>
                </div>
            `;
        } else {
            actionsHtml = `
                <div class="msg-actions">
                    <button class="msg-action-btn" id="copy-btn-msg"><i class="fa-solid fa-copy"></i> Copiar</button>
                </div>
            `;
        }
        
        bubble.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-blue-50 flex-shrink-0 flex items-center justify-center border border-blue-100 mt-1">
                <i class="fa-solid fa-robot text-blue-500 text-xs"></i>
            </div>
            <div class="flex-grow min-w-0">
                <span class="text-sm font-bold text-gray-700 mb-1 block">Oráculo</span>
                <div class="text-gray-600 leading-relaxed text-[14.5px]">${formattedContent}</div>
                ${actionsHtml}
            </div>
        `;
        
        // Listeners for copy and regenerate
        const copyBtn = bubble.querySelector('#copy-btn-msg');
        if (copyBtn) copyBtn.addEventListener('click', () => copyMessageText(copyBtn, content));
        const regenBtn = bubble.querySelector('#regen-btn-msg');
        if (regenBtn) regenBtn.addEventListener('click', () => regenerateLastResponse());
        
        container.appendChild(bubble);
    }
    
    els.chatWindow.appendChild(container);
    scrollToBottom();
}

function copyMessageText(button, text) {
    navigator.clipboard.writeText(text).then(() => {
        const original = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-check text-green-500"></i> Copiado';
        setTimeout(() => button.innerHTML = original, 2000);
    }).catch(() => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        const original = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-check text-green-500"></i> Copiado';
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
    const els = getDOMElements();
    if (els.chatWindow) els.chatWindow.scrollTop = els.chatWindow.scrollHeight;
}

function showStatusNotification(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerText = message;
    
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: '#ffffff',
        color: '#1f2937',
        border: '1px solid #f3f4f6',
        borderRadius: 'var(--border-radius-md)',
        padding: '12px 20px',
        fontSize: '13.5px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
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

// --- PIPELINE PROGRESS HUD ---
function updateHUDStep(stepIndex, status) {
    const stepEl = document.getElementById(`hud-step-${stepIndex}`);
    if (!stepEl) return;
    
    stepEl.className = `hud-step ${status}`;
    const iconEl = stepEl.querySelector('.step-icon');
    
    if (status === 'active') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        stepEl.style.color = '#2563eb';
    } else if (status === 'completed') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-check text-green-500"></i>';
        stepEl.style.color = '#10b981';
    } else if (status === 'error') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-exclamation text-red-500"></i>';
        stepEl.style.color = '#ef4444';
    } else {
        iconEl.innerHTML = '<i class="fa-solid fa-clock"></i>';
        stepEl.style.color = '#6b7280';
    }
}

function updateHUDBadge(agentId, status) {
    const badge = document.getElementById(`badge-${agentId}`);
    if (!badge) return;
    badge.className = `badge-subagent ${status}`;
}

// --- AUDIT DRAWER ---
function toggleAuditPanel() {
    const els = getDOMElements();
    if (els.auditDrawer.style.display === 'none') {
        els.auditDrawer.style.display = 'flex';
    } else {
        els.auditDrawer.style.display = 'none';
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
    
    document.getElementById('audit-capa0-json').innerText = JSON.stringify(pipelineData.capa0, null, 2);
    
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

// --- CORE AGENTIC PIPELINE (Map-Reduce) ---
async function executeChatRequest(query) {
    if (isGenerating) return;
    
    const els = getDOMElements();
    
    isGenerating = true;
    els.btnSend.style.display = 'none';
    els.btnStop.style.display = 'flex';
    els.chatInput.disabled = true;
    
    // Add user query message
    renderMessage('user', query, true, false);
    
    // Show Pipeline HUD
    const hud = document.getElementById('pipeline-hud');
    hud.style.display = 'flex';
    
    // Reset steps
    updateHUDStep(0, 'active');
    updateHUDStep(1, 'pending');
    updateHUDStep(2, 'pending');
    INVESTORS_LIST.forEach(inv => updateHUDBadge(inv.id, 'pending'));
    
    let simulatedInterval = simulateHUDProgress();
    abortController = new AbortController();
    
    try {
        const response = await fetch('/api/deliberate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
            signal: abortController.signal
        });
        
        clearInterval(simulatedInterval);
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Complete HUD steps
        updateHUDStep(0, 'completed');
        updateHUDStep(1, 'completed');
        updateHUDStep(2, 'completed');
        INVESTORS_LIST.forEach(inv => updateHUDBadge(inv.id, 'completed'));
        
        setTimeout(() => { hud.style.display = 'none'; }, 600);
        
        // Save history
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
        els.chatWindow.innerHTML = '';
        chatMessages.forEach((msg, idx) => {
            const isLastAI = (msg.role === 'model' && idx === chatMessages.length - 1);
            renderMessage(msg.role, msg.content, false, isLastAI);
        });
        
        // Populate audit
        currentPipelineData = pipelineData;
        populateAuditPanel(pipelineData);
        els.btnOpenAudit.style.display = 'flex';
        
    } catch (error) {
        clearInterval(simulatedInterval);
        hud.style.display = 'none';
        
        if (error.name === 'AbortError') {
            renderMessage('model', '*(La sesión del consejo fue interrumpida por el usuario)*', true, true);
        } else {
            console.error("Pipeline execution error:", error);
            renderMessage('model', `⚠️ **Error en el Pipeline Agéntico**
            
Ocurrió una falla en la ejecución del consejo de inversores.

* **Detalle del error**: \`${error.message}\`
* Asegúrate de configurar las variables de entorno (\`ANTHROPIC_API_KEY\`, \`SERPER_API_KEY\`, etc.) en tu panel de Vercel.`, true, true);
        }
    } finally {
        isGenerating = false;
        abortController = null;
        els.btnStop.style.display = 'none';
        els.btnSend.style.display = 'flex';
        els.chatInput.disabled = false;
        els.chatInput.focus();
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
        
        if (elapsed >= 2.0 && elapsed < 6.0) {
            const index = Math.floor((elapsed - 2.0) / 0.5);
            if (index < INVESTORS_LIST.length) {
                updateHUDBadge(INVESTORS_LIST[index].id, 'analyzing');
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

// --- SUBMITS & TRANSITIONS ---
function handleMainEnter(e) {
    if (e.key === 'Enter') startChat();
}

function handleChatEnter(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
}

function startChat() {
    const els = getDOMElements();
    if (els.mainInput.value.trim() === "") {
        els.mainInput.focus();
        return;
    }
    
    // Transition animation
    els.mainInterface.style.opacity = '0';
    els.mainInterface.style.transform = 'translate(-50%, -60%)';
    
    setTimeout(() => {
        els.mainInterface.classList.add('hidden-chat');
        els.chatInterface.classList.remove('hidden-chat');
        
        setTimeout(() => {
            els.chatInterface.classList.add('fade-enter-active');
            
            const question = els.mainInput.value;
            activeChatId = null; // New chat
            executeChatRequest(question);
        }, 50);
    }, 400);
}

function resetUI() {
    const els = getDOMElements();
    els.chatInterface.classList.remove('fade-enter-active');
    els.chatInterface.style.opacity = '0';
    
    setTimeout(() => {
        els.chatInterface.classList.add('hidden-chat');
        els.chatInterface.style.opacity = '1'; // Reset
        
        els.mainInterface.classList.remove('hidden-chat');
        void els.mainInterface.offsetWidth; // Force reflow
        
        els.mainInterface.style.opacity = '1';
        els.mainInterface.style.transform = 'translate(-50%, -50%)';
        
        els.chatWindow.innerHTML = '';
        els.mainInput.value = '';
        els.chatInput.value = '';
        els.mainInput.focus();
        
        activeChatId = null;
        currentPipelineData = null;
        els.btnOpenAudit.style.display = 'none';
        els.auditDrawer.style.display = 'none';
        
        loadConversationsList();
    }, 300);
}

function randomQuestion() {
    const els = getDOMElements();
    const questions = [
        "¿Qué diría Benjamin Graham sobre la compra de Bitcoin (BTC)?",
        "Analizá YPF a largo plazo con la óptica de Warren Buffett.",
        "Evaluá la acción de Apple (AAPL) para un perfil conservador.",
        "¿Cómo estructuraría Seth Klarman una cartera con 100% de acciones?"
    ];
    const random = questions[Math.floor(Math.random() * questions.length)];
    
    els.mainInput.value = '';
    let i = 0;
    
    const typeWriter = setInterval(() => {
        if (i < random.length) {
            els.mainInput.value += random.charAt(i);
            i++;
        } else {
            clearInterval(typeWriter);
            setTimeout(startChat, 500);
        }
    }, 25);
}

function sendChatMessage() {
    if (isGenerating) return;
    const els = getDOMElements();
    const query = els.chatInput.value.trim();
    if (!query) return;
    
    els.chatInput.value = '';
    els.chatInput.style.height = '24px';
    executeChatRequest(query);
}

function selectSuggestion(query) {
    const els = getDOMElements();
    els.mainInput.value = query;
    startChat();
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
    
    if (chat.messages[chat.messages.length - 1].role === 'model') {
        chat.messages.pop();
    }
    
    const els = getDOMElements();
    const containers = els.chatWindow.querySelectorAll('.w-full');
    if (containers.length > 0) {
        const lastContainer = containers[containers.length - 1];
        if (lastContainer.querySelector('.oracle-msg')) {
            lastContainer.remove();
        }
    }
    
    const lastUserQuery = chat.messages[chat.messages.length - 1].content;
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
    const els = getDOMElements();
    if (els.sidebar) els.sidebar.classList.toggle('open');
}

function setupTextareaAutoResize() {
    const textarea = document.getElementById('chat-input');
    if (textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = '24px';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }
}
