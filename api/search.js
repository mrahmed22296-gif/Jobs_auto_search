export default async function handler(req, res) {
    // تأكد دائماً من إرجاع JSON
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { linkedinUrl } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ 
            error: 'مفتاح الـ API غير مُعرّف في إعدادات Vercel (Environment Variables).' 
        });
    }

    if (!linkedinUrl || !linkedinUrl.trim()) {
        return res.status(400).json({ error: 'رابط لينكدإن مفقود.' });
    }

    // قائمة الموديلات بالترتيب المفضل (الأقل ضغطاً أولاً)
    const models = [
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-3.6-flash',
        'gemini-3.5-flash'
    ];

    const prompt = `أنت مساعد توظيف محترف وخبير تحليل سير ذاتية. 
بناءً على رابط ملف لينكدإن المقدم الآتي: "${linkedinUrl}"، 
قم باقتراح 4 وظائف مناسبة مع:
- المسمى الوظيفي
- المهارات المتوافقة
- نسبة التوافق التقريبية
- وصف مختصر لسبب الترشيح

قدم النتائج بتنسيق HTML نظيف ومرتب وواضح.`;

    let lastError = null;

    for (const model of models) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            contents: [
                                {
                                    parts: [{ text: prompt }]
                                }
                            ]
                        })
                    }
                );

                const data = await response.json();

                // نجح الطلب
                if (response.ok && data.candidates && data.candidates.length > 0) {
                    const aiContent = data.candidates[0].content.parts[0].text;
                    return res.status(200).json({ result: aiContent });
                }

                const errorMsg = data.error?.message || JSON.stringify(data);
                lastError = errorMsg;

                // ضغط عالي → انتظر وجرب تاني
                if (errorMsg.toLowerCase().includes('high demand') && attempt < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
                    continue;
                }

                // موديل غير متاح للمستخدمين الجدد → جرب الموديل التالي
                if (
                    errorMsg.includes('no longer available') ||
                    errorMsg.includes('not found') ||
                    errorMsg.includes('is not found')
                ) {
                    break; // جرب الموديل التالي
                }

                // أي خطأ آخر
                return res.status(response.status || 500).json({ 
                    error: `خطأ من Gemini (${model}): ${errorMsg}` 
                });

            } catch (err) {
                lastError = err.message;
                if (attempt < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
            }
        }
    }

    // لو كل الموديلات فشلت
    return res.status(503).json({ 
        error: `كل الموديلات مشغولة حالياً أو غير متاحة. جرب بعد دقيقة. (آخر خطأ: ${lastError || 'غير معروف'})` 
    });
}
