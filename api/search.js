export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { linkedinUrl, jobTitle, profileText } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ 
            error: 'مفتاح الـ API غير مُعرّف في إعدادات Vercel.' 
        });
    }

    if (!profileText || profileText.trim().length < 40) {
        return res.status(400).json({ 
            error: 'لم يتم استخراج نص كافٍ من السيرة الذاتية.' 
        });
    }

    const models = [
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-3.6-flash',
        'gemini-3.5-flash'
    ];

    const jobTitleInstruction = jobTitle 
        ? `\nالمستخدم يريد التركيز على الوظائف المتعلقة بـ: "${jobTitle}". أعطِ أولوية عالية لهذه الوظيفة أو الوظائف المشابهة لها جداً.`
        : '';

    const prompt = `
أنت مساعد توظيف محترف وخبير تحليل سير ذاتية.

${linkedinUrl ? `رابط لينكدإن: ${linkedinUrl}\n` : ''}
${jobTitleInstruction}

نص السيرة الذاتية:
"""
${profileText}
"""

قم بتحليل السيرة الذاتية بدقة واقتراح 4 وظائف مناسبة جداً.

لكل وظيفة اكتب بالتنسيق التالي تماماً (HTML):

<div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:16px; background:white;">
  <h3 style="margin:0 0 8px 0; color:#1e40af;">1. المسمى الوظيفي</h3>
  <p><strong>نسبة التوافق:</strong> XX%</p>
  <p><strong>المهارات المتوافقة:</strong> ...</p>
  <p><strong>سبب الترشيح:</strong> ...</p>
  <p style="margin-top:12px;">
    <strong>روابط التقديم المباشر:</strong><br>
    • <a href="رابط لينكدإن جوبس" target="_blank" style="color:#2563eb;">LinkedIn Jobs</a><br>
    • <a href="رابط ويزاف أو بيت.كوم" target="_blank" style="color:#2563eb;">Wuzzuf / Bayt</a><br>
    • <a href="رابط جوجل جوبس" target="_blank" style="color:#2563eb;">Google Jobs</a>
  </p>
</div>

مهم جداً:
- أنشئ روابط بحث حقيقية وفعالة (مثال: https://www.linkedin.com/jobs/search/?keywords=Chief%20Accountant)
- استخدم كلمات البحث المناسبة للوظيفة + مصر أو الخليج حسب الخبرات.
- لا تكتب أي نص خارج الـ HTML المطلوب.
`;

    let lastError = null;

    for (const model of models) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }]
                        })
                    }
                );

                const data = await response.json();

                if (response.ok && data.candidates?.length > 0) {
                    const aiContent = data.candidates[0].content.parts[0].text;
                    return res.status(200).json({ result: aiContent });
                }

                const errorMsg = data.error?.message || JSON.stringify(data);
                lastError = errorMsg;

                if (errorMsg.toLowerCase().includes('high demand') && attempt < 2) {
                    await new Promise(r => setTimeout(r, 1500 * attempt));
                    continue;
                }

                if (
                    errorMsg.includes('no longer available') ||
                    errorMsg.includes('not found') ||
                    errorMsg.includes('is not found')
                ) {
                    break;
                }

                return res.status(response.status || 500).json({ 
                    error: `خطأ من Gemini (${model}): ${errorMsg}` 
                });

            } catch (err) {
                lastError = err.message;
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
            }
        }
    }

    return res.status(503).json({ 
        error: `كل الموديلات مشغولة حالياً. جرب بعد دقيقة. (آخر خطأ: ${lastError || 'غير معروف'})` 
    });
}
