export default async function handler(req, res) {
    // מאפשר קבלת בקשות רק מסוג POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GROQ_API_KEY;

    // הגנה מקדימה למקרה שהמפתח לא הוזרק כראוי
    if (!apiKey) {
        return res.status(500).json({ error: 'משתנה הסביבה GROQ_API_KEY לא הוגדר ב-Vercel.' });
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: req.body.messages
            })
        });

        const data = await response.json();

        // אם גרוק מחזירים קוד שגיאה (כמו מפתח לא תקין או הגבלת קצב) - נחזיר את הסיבה המדויקת
        if (!response.ok) {
            return res.status(response.status).json({ 
                choices: { message: { content: `שגיאה ישירה משרתי Groq: ${data.error?.message || JSON.stringify(data.error)}` } } 
            });
        }

        return res.status(200).json(data);

    } catch (error) {
        // מחזיר את הודעת השגיאה הטכנית המלאה כדי שלא תצטרך לנחש
        return res.status(200).json({ 
            choices: { message: { content: `נכשלה הפנייה הפיזית לשרת של גרוק. סיבת שגיאה: ${error.message}` } } 
        });
    }
}
