export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // נמשוך את המפתח החינמי של גרוק ממשתני הסביבה
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'מפתח ה-API של Groq לא הוגדר ב-Vercel.' });
    }

    try {
        // פנייה לשרתים המהירים והחינמיים של Groq
        const response = await fetch("https://groq.com", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // מודל חזק, מהיר וחינמי לחלוטין
                messages: req.body.messages
            })
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'שגיאה בפנייה לשרתי Groq החינמיים.' });
    }
}
