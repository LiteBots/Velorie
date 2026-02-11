const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Konfiguracja API
const API_SECRET_KEY = 'Vl332017770809200033201';
const DATA_DIR = path.join(__dirname, 'data');

// Upewnij się, że folder na transkrypcje istnieje
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

app.use(bodyParser.json({ limit: '10mb' })); // Zwiększony limit na wypadek długich logów

// Prosta funkcja ucieczki HTML zapobiegająca XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// 1. ENDPOINT API - Odbiór danych od bota Discorda
app.post('/api/ticket', (req, res) => {
    const authHeader = req.headers['authorization'];

    if (authHeader !== API_SECRET_KEY) {
        return res.status(403).json({ error: 'Nieautoryzowany dostęp.' });
    }

    const payload = req.body;
    
    if (!payload.ticket || !payload.ticket.transcript_id) {
        return res.status(400).json({ error: 'Brak wymaganych danych transkrypcji.' });
    }

    const transcriptId = payload.ticket.transcript_id;
    const filePath = path.join(DATA_DIR, `${transcriptId}.json`);

    try {
        // Zapisz dane do pliku (możesz w przyszłości zmienić to na MySQL/MongoDB)
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`[API] Zapisano transkrypcję: ${transcriptId}`);
        res.status(200).json({ success: true, url: `https://ticket.velorie.pl/${transcriptId}` });
    } catch (error) {
        console.error('[API] Błąd zapisu pliku:', error);
        res.status(500).json({ error: 'Błąd serwera podczas zapisu transkrypcji.' });
    }
});

// 2. ENDPOINT FRONTEND - Wyświetlanie transkrypcji
app.get('/:id', (req, res) => {
    const transcriptId = req.params.id;
    const filePath = path.join(DATA_DIR, `${transcriptId}.json`);

    // Sprawdź czy taka transkrypcja istnieje
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('<h1>Błąd 404 - Nie znaleziono transkrypcji o podanym ID.</h1>');
    }

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const ticket = data.ticket;
        const messages = data.messages;

        // Budowanie HTML wiadomości w pętli
        const messagesHtml = messages.map(msg => {
            const avatarUrl = msg.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.author_name)}`;
            const ringClass = msg.is_admin ? 'ring-[var(--accent)]/50' : 'ring-white/10';
            const roleBadge = msg.is_admin
                ? `<span class="bg-[var(--accent)]/20 border border-[var(--accent)]/30 text-[var(--accent)] text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><i data-lucide="shield-check" class="h-3 w-3"></i> Admin</span>`
                : `<span class="bg-white/10 border border-white/5 text-white/80 text-[10px] px-2 py-0.5 rounded-full">Użytkownik</span>`;
            const bubbleClass = msg.is_admin
                ? 'text-white/90 bg-[var(--accent)]/10 border border-[var(--accent)]/20'
                : 'text-white/80 bg-white/5 border border-white/5';
            
            const dateObj = new Date(msg.timestamp);
            const dateStr = dateObj.toLocaleString('pl-PL');

            return `
            <div class="message-group flex gap-4">
              <div class="shrink-0">
                <img src="${avatarUrl}" alt="Avatar" class="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-black/40 ring-1 ${ringClass}" />
              </div>
              <div class="flex-grow min-w-0">
                <div class="flex items-baseline gap-2 mb-1">
                  <span class="font-bold text-white text-sm sm:text-base">${escapeHtml(msg.author_name)}</span>
                  ${roleBadge}
                  <span class="text-xs text-white/40 ml-2">${dateStr}</span>
                </div>
                <div class="message-bubble text-sm sm:text-base ${bubbleClass} rounded-2xl rounded-tl-none p-4 inline-block max-w-3xl whitespace-pre-wrap">${escapeHtml(msg.content)}</div>
              </div>
            </div>`;
        }).join('\n');

        // Odczyt szablonu HTML z poziomu roota
        let htmlTemplate = fs.readFileSync(path.join(__dirname, 'transcript.html'), 'utf-8');

        // Zastępowanie placeholderów w HTML
        htmlTemplate = htmlTemplate
            .replace(/{{TICKET_ID}}/g, escapeHtml(transcriptId.substring(0, 8).toUpperCase())) // Skrócone ID do wyświetlania
            .replace(/{{TOPIC}}/g, escapeHtml(ticket.topic))
            .replace(/{{CREATOR_NAME}}/g, escapeHtml(ticket.creator_name))
            .replace(/{{CLOSED_BY_NAME}}/g, escapeHtml(ticket.closed_by_name))
            .replace(/{{CREATED_AT}}/g, new Date(ticket.created_at).toLocaleString('pl-PL'))
            .replace(/{{CLOSED_AT}}/g, new Date(ticket.closed_at).toLocaleString('pl-PL'))
            .replace(/{{MESSAGES_HTML}}/g, messagesHtml)
            .replace(/{{CURRENT_YEAR}}/g, new Date().getFullYear());

        res.send(htmlTemplate);

    } catch (error) {
        console.error('[Web] Błąd renderowania transkrypcji:', error);
        res.status(500).send('<h1>Błąd 500 - Wewnętrzny błąd serwera.</h1>');
    }
});

app.listen(PORT, () => {
    console.log(`[Server] API i podgląd transkrypcji działają na http://localhost:${PORT}`);
});
