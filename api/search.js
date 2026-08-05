export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { linkedinUrl } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'مفتاح الـ API غير مُعرّف في إعدادات Vercel.' });
    }

    if (!linkedinUrl) {
        return res.status(400).json({ error: 'رابط لينكدإن مفقود.' });
    }

    try {
        // استخدام النموذج الصحيح مع الإصدار المستقر
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `أنت مساعد توظيف محترف وخبير تحليل سير ذاتية. بناءً على رابط ملف لينكدإن المقدم الآتي: "${linkedinUrl}", قم باقتراح 4 وظائف مناسبة مع المسمى الوظيفي، والمهارات المتوافقة، ونسبة التوافق التقريبية، ووصف مختصر لسبب الترشيح. قدم النتائج بتنسيق HTML نظيف ومرتب مع ألوان جذابة وتصميم احترافي.`
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000,
                    topK: 40,
                    topP: 0.95
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            const errorMsg = data.error?.message || JSON.stringify(data);
            return res.status(response.status).json({ error: `خطأ من Gemini: ${errorMsg}` });
        }

        if (data.candidates && data.candidates.length > 0) {
            const aiContent = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ result: aiContent });
        } else {
            return res.status(500).json({ error: 'لم يتم استلام أي استجابة من نموذج الذكاء الاصطناعي.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'خطأ في الاتصال بالخادم: ' + error.message });
    }
}