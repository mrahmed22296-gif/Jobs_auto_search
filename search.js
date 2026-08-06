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
        ? `\nالمستخدم يريد التركيز على الوظائف المتعلقة بـ: "${jobTitle}". أعطِ أولوية عالية لهذه الوظيفة أو الوظائف المشابهة لها.`
        : '';

    const prompt = `
أنت مساعد توظيف محترف وخبير تحليل سير ذاتية.

${linkedinUrl ? `رابط لينكدإن: ${linkedinUrl}\n` : ''}
${jobTitleInstruction}

نص السيرة الذاتية:
"""
${profileText}
"""

قم بتحليل السيرة الذاتية بدقة واقتراح **8 وظائف** مناسبة جداً.

لكل وظيفة استخدم التنسيق التالي تماماً (HTML فقط بدون أي نص إضافي):

<div class="bg-white rounded-2xl border border-slate-200 p-5 mb-4 shadow-sm">
  <div class="flex items-start justify-between gap-3 mb-3">
    <h3 class="text-lg font-bold text-indigo-700 m-0">1. المسمى الوظيفي</h3>
    <span class="bg-emerald-100 text-emerald-700 text-sm font-bold px-3 py-1 rounded-full whitespace-nowrap">XX%</span>
  </div>
  <p class="text-sm text-slate-600 mb-2"><strong class="text-slate-800">المهارات المتوافقة:</strong> ...</p>
  <p class="text-sm text-slate-600 mb-4"><strong class="text-slate-800">سبب الترشيح:</strong> ...</p>
  <div class="flex flex-wrap gap-2">
    <a href="رابط_لينكدإن" target="_blank" class="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition">LinkedIn Jobs</a>
    <a href="رابط_ويزاف" target="_blank" class="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg font-medium hover:bg-purple-100 transition">Wuzzuf</a>
    <a href="رابط_بيت" target="_blank" class="text-xs bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg font-medium hover:bg-orange-100 transition">Bayt</a>
    <a href="رابط_جوجل" target="_blank" class="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg font-medium hover:bg-green-100 transition">Google Jobs</a>
  </div>
</div>

تعليمات مهمة:
- أنشئ روابط بحث حقيقية وفعالة (مثال: https://www.linkedin.com/jobs/search/?keywords=Chief%20Accountant&location=Egypt)
- استخدم كلمات البحث المناسبة + مصر أو دول الخليج حسب الخبرات.
- لا تكتب أي نص خارج الـ HTML المطلوب.
- رتب الوظائف من الأعلى توافقاً للأقل.
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
