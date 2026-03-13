/**
 * ============================================
 * 📡 DiscordNachrichten.js – Externes Script
 * ============================================
 * Lädt Community-Nachrichten aus Firebase in Echtzeit
 * und synchronisiert mit Discord Webhook
 * 
 * 🔗 Einbinden in index.html:
 * <script src="https://thenano-ai.github.io/Nano-AI/DiscordNachrichten.js" defer></script>
 * ============================================
 */

// ============================================
// 🔧 KONFIGURATION
// ============================================
const DISCORD_NACHRICHTEN_CONFIG = {
    // Firebase Config – wird von index.html übernommen falls vorhanden
    firebase: null,
    
    // Collection Name
    collection: "community",
    
    // Discord Webhook (optional, für externe Nutzung)
    webhookProxy: '',
    webhookUrl: '',
    
    // Einstellungen
    maxMessages: 50,
    realtime: true,
    fallbackPollMs: 10000,
    
    // UI
    ui: {
        containerId: "discord-messages-container",
        showTimestamps: true,
        showRankBadges: true,
        animation: true
    }
};

// ============================================
// STATE
// ============================================
let dn_db = null;
let dn_unsubscribe = null;
let dn_messageCache = new Map();

// ============================================
// HELPER FUNCTIONS
// ============================================
function dn_escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function dn_formatMessage(name, rank, text) {
    const tarifMap = { 
        'User': 'Free', 
        'Premium': 'Ultra', 
        'Pro': 'Nano Pro', 
        'Dev': 'Developer',
        'owner': 'Owner',
        'admin': 'Admin',
        'mod': 'Mod',
        'helper': 'Helper',
        'team': 'Team',
        'sponsor': 'Sponsor'
    };
    const tarif = tarifMap[rank] || rank;
    return `[${rank} | ${tarif}] ${name}: ${text}`;
}

function dn_getRankIcon(rank) {
    const icons = { 
        'User': '👤', 
        'Premium': '⭐', 
        'Pro': '🔥', 
        'Dev': '💻',
        'owner': '👑',
        'admin': '🛡️',
        'mod': '⚔️',
        'helper': '🤝',
        'team': '👥',
        'sponsor': '💎'
    };
    return icons[rank] || '👤';
}

// ============================================
// FIREBASE CONNECTION
// ============================================
async function dn_initFirebase() {
    if (dn_db) return dn_db;
    
    // Prüfen ob Firebase von index.html schon geladen wurde
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        dn_db = firebase.firestore();
        console.log('✅ DiscordNachrichten: Firebase verbunden (von index.html)');
        return dn_db;
    }
    
    // Sonst Firebase SDK dynamisch laden
    try {
        const [appMod, firestoreMod] = await Promise.all([
            import('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js'),
            import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js')
        ]);
        
        if (DISCORD_NACHRICHTEN_CONFIG.firebase) {
            appMod.initializeApp(DISCORD_NACHRICHTEN_CONFIG.firebase);
            dn_db = firestoreMod.firestore();
            console.log('✅ DiscordNachrichten: Firebase neu initialisiert');
        }
        
        return dn_db;
        
    } catch (error) {
        console.error('❌ DiscordNachrichten: Firebase Init Fehler:', error);
        return null;
    }
}

// ============================================
// REALTIME LISTENER
// ============================================
function dn_startRealtimeListener(onNewMessage, onError) {
    if (!dn_db) {
        console.warn('⚠️ DiscordNachrichten: Keine DB-Verbindung');
        return false;
    }
    
    try {
        const q = dn_db.collection(DISCORD_NACHRICHTEN_CONFIG.collection)
            .orderBy("timestamp", "desc")
            .limit(DISCORD_NACHRICHTEN_CONFIG.maxMessages);
        
        dn_unsubscribe = q.onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const msg = change.doc.data();
                    const message = {
                        id: change.doc.id,
                        name: msg.username || 'Unbekannt',
                        rank: msg.role || 'user',
                        message: msg.text || '',
                        formatted: dn_formatMessage(msg.username, msg.role, msg.text),
                        timestamp: msg.timestamp?.toDate?.() || new Date(),
                        discordSent: msg.discordSent || false
                    };
                    
                    if (!dn_messageCache.has(message.id)) {
                        dn_messageCache.set(message.id, message);
                        console.log('🆕 DiscordNachrichten: Neue Nachricht:', message.formatted);
                        onNewMessage?.(message);
                    }
                }
            });
        }, (error) => {
            console.error('❌ DiscordNachrichten: Realtime Error:', error);
            onError?.(error);
        });
        
        console.log('🔗 DiscordNachrichten: Echtzeit-Listener aktiv');
        return true;
        
    } catch (error) {
        console.error('❌ DiscordNachrichten: Listener Setup Fehler:', error);
        return false;
    }
}

// ============================================
// UI FUNCTIONS
// ============================================
function dn_addMessageToUI(message, containerId = 'communityMessages') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const rankIcons = dn_getRankIcon(message.rank);
    const time = DISCORD_NACHRICHTEN_CONFIG.ui.showTimestamps 
        ? message.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : '';
    
    const div = document.createElement('div');
    div.className = 'community-message';
    div.id = `dn-msg-${message.id}`;
    div.style.animation = DISCORD_NACHRICHTEN_CONFIG.ui.animation ? 'messageSlide 0.3s ease' : 'none';
    
    div.innerHTML = `
        ${DISCORD_NACHRICHTEN_CONFIG.ui.showRankBadges ? 
            `<span class="rank rank-${message.rank}">${rankIcons} ${message.rank}</span>` : ''}
        <span class="username">${dn_escapeHtml(message.name)}</span>
        <span class="text">${dn_escapeHtml(message.message)}</span>
        ${time ? `<div class="time">${time}</div>` : ''}
        ${message.discordSent ? '<div class="discord-status">✅ Discord</div>' : ''}
    `;
    
    container.insertBefore(div, container.firstChild);
    
    // Limit messages
    while (container.children.length > DISCORD_NACHRICHTEN_CONFIG.maxMessages) {
        container.removeChild(container.lastChild);
    }
}

// ============================================
// DISCORD WEBHOOK
// ============================================
async function dn_sendToDiscord(messageData) {
    const { webhookProxy, webhookUrl, botName, botAvatar } = DISCORD_NACHRICHTEN_CONFIG;
    
    const formattedText = dn_formatMessage(
        messageData.username,
        messageData.role,
        messageData.text
    );
    
    try {
        // Proxy (sicher)
        if (webhookProxy && !webhookProxy.includes('your-proxy')) {
            const response = await fetch(webhookProxy, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: formattedText,
                    username: botName || 'nano.ai Community',
                    avatar_url: botAvatar || ''
                })
            });
            
            if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
            console.log('✅ DiscordNachrichten: An Discord gesendet (Proxy)');
            return { success: true };
        }
        
        // Direkt (nur Tests)
        if (webhookUrl && !webhookUrl.includes('YOUR')) {
            console.warn('⚠️ DiscordNachrichten: Direct webhook - Use proxy for production!');
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: formattedText,
                    username: botName || 'nano.ai Community',
                    avatar_url: botAvatar || ''
                })
            });
            
            if (!response.ok) throw new Error(`Discord error: ${response.status}`);
            console.log('✅ DiscordNachrichten: An Discord gesendet (Direkt)');
            return { success: true };
        }
        
        return { success: false, reason: 'no_config' };
        
    } catch (error) {
        console.error('❌ DiscordNachrichten: Webhook Error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// PUBLIC API
// ============================================
window.DiscordNachrichten = {
    // Initialisieren
    init: async function(config = {}) {
        Object.assign(DISCORD_NACHRICHTEN_CONFIG, config);
        await dn_initFirebase();
        console.log('📡 DiscordNachrichten.js initialisiert');
        return this;
    },
    
    // Echtzeit-Listener starten
    startListener: function(onNewMessage, onError) {
        return dn_startRealtimeListener(onNewMessage, onError);
    },
    
    // Nachricht zur UI hinzufügen
    addMessage: function(message, containerId) {
        dn_addMessageToUI(message, containerId);
    },
    
    // An Discord senden
    sendToDiscord: function(messageData) {
        return dn_sendToDiscord(messageData);
    },
    
    // Listener stoppen
    stop: function() {
        if (dn_unsubscribe) {
            dn_unsubscribe();
            dn_unsubscribe = null;
            console.log('🛑 DiscordNachrichten: Listener gestoppt');
        }
    },
    
    // Cache leeren
    clearCache: function() {
        dn_messageCache.clear();
        console.log('🗑️ DiscordNachrichten: Cache geleert');
    },
    
    // Config
    config: DISCORD_NACHRICHTEN_CONFIG,
    
    // Version
    version: '1.0.0'
};

// ============================================
// AUTO-INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Auto-init wenn Data-Attribute vorhanden
    const autoEl = document.querySelector('[data-discord-nachrichten-auto]');
    if (autoEl) {
        window.DiscordNachrichten.init();
    }
    
    console.log('📡 DiscordNachrichten.js geladen – v1.0.0');
});
