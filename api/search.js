export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { linkedinUrl } = req.body;
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'مفتاح الـ API غير مُعرّف في إعدادات Vercel.' });
    }

    if (!linkedinUrl) {
        return res.status(400).json({ error: 'رابط لينكدإن مفقود.' });
    }

    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: "أنت مساعد توظيف محترف وخبير تحليل سير ذاتية. بناءً على رابط ملف لينكدإن المقدم، قم باقتراح 4 وظائف مناسبة مع المسمى الوظيفي، والمهارات المتوافقة، ونسبة التوافق التقريبية، ووصف مختصر لسبب الترشيح. قدم النتائج بتنسيق HTML نظيف ومرتب."
                    },
                    {
                        role: "user",
                        content: `هذا هو رابط ملف لينكدإن الخاص بي: ${linkedinUrl}. اقترح لي وظائف متطابقة.`
                    }
                ],
                stream: false
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // طباعة الخطأ الحقيقي القادم من DeepSeek لتسهيل الاكتشاف
            const errorMsg = data.error?.message || JSON.stringify(data);
            return res.status(response.status).json({ error: `خطأ من DeepSeek: ${errorMsg}` });
        }

        if (data.choices && data.choices.length > 0) {
            return res.status(200).json({ result: data.choices[0].message.content });
        } else {
            return res.status(500).json({ error: 'لم يتم استلام أي استجابة من نموذج الذكاء الاصطناعي.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'خطأ في الاتصال بالخادم: ' + error.message });
    }
}
