const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Inicjalizacja bazy danych SQLite (plik zapobiega utracie danych)
const db = new sqlite3.Database('./transcripts.db', (err) => {
    if (err) console.error('[DB] Błąd połączenia z SQLite:', err.message);
    else console.log('[DB] Połączono z bazą SQLite.');
});

// Tworzenie tabel, jeśli nie istnieją
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        transcript_id TEXT PRIMARY KEY,
        channel_id TEXT,
        creator_name TEXT,
        creator_id TEXT,
        topic TEXT,
        created_at TEXT,
        closed_at TEXT,
        closed_by_name TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transcript_id TEXT,
        author_name TEXT,
        author_avatar TEXT,
        is_admin INTEGER,
        content TEXT,
        timestamp TEXT,
        FOREIGN KEY(transcript_id) REFERENCES tickets(transcript_id)
    )`);
});

// Endpoint API: Odbieranie transkrypcji z bota
app.post('/api/ticket', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader !== process.env.API_SECRET_KEY) {
        return res.status(403).json({ error: 'Brak uprawnień lub zły klucz API.' });
    }

    const { ticket, messages } = req.body;
    if (!ticket || !messages) {
        return res.status(400).json({ error: 'Brakuje danych zgłoszenia lub wiadomości.' });
    }

    // Zapis do tabeli tickets
    const stmtTicket = db.prepare(`INSERT INTO tickets (transcript_id, channel_id, creator_name, creator_id, topic, created_at, closed_at, closed_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    stmtTicket.run(
        ticket.transcript_id,
        ticket.channel_id,
        ticket.creator_name,
        ticket.creator_id,
        ticket.topic,
        ticket.created_at,
        ticket.closed_at,
        ticket.closed_by_name,
        function(err) {
            if (err) return res.status(500).json({ error: 'Błąd bazy danych (ticket).' });
            
            // Zapis do tabeli messages
            const stmtMsg = db.prepare(`INSERT INTO messages (transcript_id, author_name, author_avatar, is_admin, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)`);
            messages.forEach((msg) => {
                stmtMsg.run(
                    ticket.transcript_id,
                    msg.author_name,
                    msg.author_avatar,
                    msg.is_admin ? 1 : 0,
                    msg.content,
                    msg.timestamp
                );
            });
            stmtMsg.finalize();
            
            res.status(200).json({ success: true, url: `/${ticket.transcript_id}` });
        }
    );
    stmtTicket.finalize();
});

// Frontend: Wyświetlanie transkrypcji
app.get('/:id', (req, res) => {
    const transcriptId = req.params.id;

    db.get(`SELECT * FROM tickets WHERE transcript_id = ?`, [transcriptId], (err, ticket) => {
        if (err || !ticket) {
            return res.status(404).send('Nie znaleziono takiej transkrypcji.');
        }

        db.all(`SELECT * FROM messages WHERE transcript_id = ? ORDER BY id ASC`, [transcriptId], (err, messages) => {
            if (err) messages = [];
            res.render('transcript', { ticket, messages });
        });
    });
});

module.exports = app;
