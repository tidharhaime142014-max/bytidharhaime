export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // קריאת המפתח החינמי של גרוק מתוך ורסל
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'מפתח ה-API של Groq לא הוגדר ב-Vercel או שלא בוצע Redeploy.' });
    }

    try {
        const response = await fetch("https://groq.com", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey.trim()}` // .trim() מונע בעיות של רווחים שהועתקו בטעות
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // מודל חזק, חינמי ומהיר
                messages: req.body.messages
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // אם שרתי גרוק מחזירים שגיאה (למשל מפתח שגוי), נציג אותה ישירות למסך
            return res.status(response.status).json({ error: data.error?.message || "שגיאה פנימית של Groq" });
        }

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'נכשלה הפנייה הפיזית לשרת. ודא שהחיבור תקין.' });
    }
}
