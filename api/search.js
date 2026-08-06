// ... existing code ...

try {
    // Use a currently supported model (gemini-1.5-flash is deprecated)
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `أنت مساعد توظيف محترف وخبير تحليل سير ذاتية. بناءً على رابط ملف لينكدإن المقدم الآتي: "${linkedinUrl}", قم باقتراح 4 وظائف مناسبة مع المسمى الوظيفي، والمهارات المتوافقة، ونسبة التوافق التقريبية، ووصف مختصر لسبب الترشيح. قدم النتائج بتنسيق HTML نظيف ومرتب.`
                            }
                        ]
                    }
                ]
            })
        }
    );

    // ... rest of the code stays the same ...
