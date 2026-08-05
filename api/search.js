export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { linkedinUrl } = req.body;
    
    // محاولة استخدام DeepSeek API أولاً
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!deepseekKey && !geminiKey) {
        return res.status(500).json({ error: 'مفتاح الـ API غير مُعرّف في إعدادات Vercel.' });
    }

    if (!linkedinUrl) {
        return res.status(400).json({ error: 'رابط لينكدإن مفقود.' });
    }

    try {
        let aiContent = null;
        let usedAPI = '';

        // المحاولة الأولى: استخدام DeepSeek (الأكثر استقراراً)
        if (deepseekKey) {
            try {
                const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${deepseekKey}`
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [
                            {
                                role: 'system',
                                content: 'أنت مساعد توظيف محترف وخبير تحليل سير ذاتية. قم بتقديم إجابات منظمة ومفصلة.'
                            },
                            {
                                role: 'user',
                                content: `بناءً على رابط ملف لينكدإن المقدم الآتي: "${linkedinUrl}", قم باقتراح 4 وظائف مناسبة مع المسمى الوظيفي، والمهارات المتوافقة، ونسبة التوافق التقريبية، ووصف مختصر لسبب الترشيح. قدم النتائج بتنسيق HTML نظيف ومرتب مع ألوان جذابة وتصميم احترافي.`
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 1500
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    aiContent = data.choices[0].message.content;
                    usedAPI = 'DeepSeek';
                }
            } catch (deepseekError) {
                console.log('DeepSeek error:', deepseekError.message);
            }
        }

        // إذا فشل DeepSeek، جرب Gemini مع إصدار مختلف
        if (!aiContent && geminiKey) {
            try {
                // تجربة النماذج المختلفة
                const models = [
                    'gemini-1.0-pro',
                    'gemini-1.0-pro-vision',
                    'gemini-pro'
                ];

                for (const model of models) {
                    try {
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                contents: [
                                    {
                                        parts: [
                                            {
                                                text: `أنت مساعد توظيف محترف. بناءً على رابط ملف لينكدإن: "${linkedinUrl}", اقترح 4 وظائف مناسبة مع المسمى الوظيفي، المهارات، نسبة التوافق، وسبب الترشيح. قدم النتائج بتنسيق HTML جميل.`
                                            }
                                        ]
                                    }
                                ],
                                generationConfig: {
                                    temperature: 0.7,
                                    maxOutputTokens: 1000
                                }
                            })
                        });

                        if (response.ok) {
                            const data = await response.json();
                            if (data.candidates && data.candidates.length > 0) {
                                aiContent = data.candidates[0].content.parts[0].text;
                                usedAPI = `Gemini (${model})`;
                                break;
                            }
                        }
                    } catch (modelError) {
                        console.log(`Model ${model} failed:`, modelError.message);
                        continue;
                    }
                }
            } catch (geminiError) {
                console.log('Gemini error:', geminiError.message);
            }
        }

        // إذا نجح أي من الـ APIs
        if (aiContent) {
            return res.status(200).json({ 
                result: aiContent,
                usedAPI: usedAPI,
                timestamp: new Date().toISOString()
            });
        } else {
            // تقديم استجابة بديلة في حالة فشل جميع الـ APIs
            const fallbackResponse = generateFallbackResponse(linkedinUrl);
            return res.status(200).json({ 
                result: fallbackResponse,
                usedAPI: 'Fallback',
                note: 'تم استخدام استجابة محلية بدلاً من الذكاء الاصطناعي'
            });
        }

    } catch (error) {
        return res.status(500).json({ error: 'خطأ في الاتصال بالخادم: ' + error.message });
    }
}

// دالة مساعدة لتوليد استجابة بديلة
function generateFallbackResponse(linkedinUrl) {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0A66C2;">نتائج البحث عن وظائف</h2>
        <p style="color: #666;">تم تحليل الملف الشخصي: ${linkedinUrl}</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0A66C2;">💡 وظائف مقترحة</h3>
            <ul style="list-style: none; padding: 0;">
                <li style="padding: 10px; border-bottom: 1px solid #e9ecef;">
                    <strong>مطور برمجيات</strong> - توافق: 85%
                    <br><span style="color: #666;">المهارات: JavaScript, Python, React</span>
                </li>
                <li style="padding: 10px; border-bottom: 1px solid #e9ecef;">
                    <strong>محلل بيانات</strong> - توافق: 75%
                    <br><span style="color: #666;">المهارات: SQL, Python, Tableau</span>
                </li>
                <li style="padding: 10px; border-bottom: 1px solid #e9ecef;">
                    <strong>مدير مشاريع</strong> - توافق: 70%
                    <br><span style="color: #666;">المهارات: Agile, Scrum, Jira</span>
                </li>
                <li style="padding: 10px;">
                    <strong>مستشار تقني</strong> - توافق: 65%
                    <br><span style="color: #666;">المهارات: تحليل الأعمال، حلول تقنية</span>
                </li>
            </ul>
        </div>
        
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px;">
            <p style="color: #856404; margin: 0;">
                ⚠️ هذه النتائج أولية. للحصول على نتائج دقيقة، يرجى التأكد من إعدادات API.
            </p>
        </div>
    </div>
    `;
}