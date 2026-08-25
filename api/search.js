/**
 * Vercel serverless function: receives extracted CV text and returns structured
 * job-title suggestions plus safe LinkedIn search URLs. It never scrapes LinkedIn
 * or submits applications; the browser opens the official search page for the user.
 */
const MAX_PROFILE_LENGTH = 12000;
const MAX_SUGGESTIONS = 8;

function makeLinkedInSearchUrl(title, location) {
  const params = new URLSearchParams({
    keywords: String(title || "").trim(),
    location: String(location || "").trim(),
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

function parseModelJson(text) {
  const normalized = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(normalized);
}

function normalizeSuggestions(payload, location) {
  const source = Array.isArray(payload) ? payload : payload?.suggestions;
  if (!Array.isArray(source)) return [];

  return source
    .slice(0, MAX_SUGGESTIONS)
    .map((item) => {
      const title = String(item?.title || "")
        .trim()
        .slice(0, 120);
      const score = Math.max(0, Math.min(100, Number(item?.match_score) || 0));
      const skills = Array.isArray(item?.skills)
        ? item.skills
            .map((skill) => String(skill).trim())
            .filter(Boolean)
            .slice(0, 5)
        : [];
      const reason = String(item?.reason || "")
        .trim()
        .slice(0, 400);
      return {
        title,
        match_score: score,
        skills,
        reason,
        search_url: makeLinkedInSearchUrl(title, location),
      };
    })
    .filter((item) => item.title && item.reason);
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { jobTitle = "", location = "", profileText = "" } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return res
      .status(500)
      .json({ error: "مفتاح GEMINI_API_KEY غير مُعرّف في إعدادات الخادم." });

  const profile = String(profileText).trim();
  if (profile.length < 40)
    return res
      .status(400)
      .json({ error: "لم يتم استخراج نص كافٍ من السيرة الذاتية." });

  const target = String(jobTitle).trim();
  const prompt = `أنت خبير توظيف. حلّل نص السيرة الذاتية التالي واقترح حتى ${MAX_SUGGESTIONS} عناوين وظيفية مناسبة للبحث عنها في LinkedIn.

المسمى الذي يرغب المستخدم بالتركيز عليه: ${target || "غير محدد"}
الموقع: ${String(location).trim() || "غير محدد"}

أعد JSON صالحاً فقط، دون Markdown أو HTML، بالشكل:
{"suggestions":[{"title":"...","match_score":85,"skills":["..."],"reason":"سبب عربي موجز ودقيق"}]}

ضوابط: لا تخترع شركات أو إعلانات أو روابط أو نتائج توظيف. اقترح مسميات وظيفية فقط. اجعل reason باللغة العربية، وskills من 2 إلى 5 مهارات ذات صلة.

نص السيرة الذاتية:
---
${profile.slice(0, MAX_PROFILE_LENGTH)}
---`;

  const models = process.env.GEMINI_MODEL
    ? [process.env.GEMINI_MODEL]
    : ["gemini-2.5-flash", "gemini-2.0-flash"];
  let lastError = "تعذر الاتصال بخدمة الاقتراحات.";

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.3,
            },
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        lastError =
          body?.error?.message || `Gemini ${model} returned ${response.status}`;
        continue;
      }

      const text =
        body?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("") || "";
      const suggestions = normalizeSuggestions(parseModelJson(text), location);
      if (suggestions.length) return res.status(200).json({ suggestions });
      lastError = "لم تُرجع الخدمة اقتراحات منظمة قابلة للاستخدام.";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return res
    .status(502)
    .json({ error: `تعذر إنشاء الاقتراحات حالياً: ${lastError}` });
}
