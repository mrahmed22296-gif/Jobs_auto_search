import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Initialize the Google Gen AI client with your env variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req) {
  try {
    const { userProfile, jobTitle, location } = await req.json();

    // 1. Fetch raw job listings via Apify LinkedIn Scraper
    const scrapeResponse = await fetch(
      `https://api.apify.com/v2/acts/apify~linkedin-jobs-scraper/runs?token=${process.env.APIFY_API_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: jobTitle, location: location, limit: 5 }),
      }
    );
    
    const scrapeData = await scrapeResponse.json();
    const rawJobs = scrapeData?.data?.items || [];

    // 2. Process and score jobs using Gemini 2.5 Flash
    const prompt = `
      You are an expert career agent.
      
      User Profile: ${userProfile}
      Job Listings: ${JSON.stringify(rawJobs)}

      Evaluate each job for how well it matches the user's profile.
      Return a JSON array of objects with the following properties:
      - title: (string)
      - company: (string)
      - url: (string)
      - matchScore: (number 0 to 100)
      - reason: (1-2 sentence match justification)
      - customCoverLetter: (a short 3-sentence application pitch for the candidate)
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json', // Enforces structured JSON output
      },
    });

    const parsedResults = JSON.parse(response.text);

    return NextResponse.json({ success: true, results: parsedResults });
  } catch (error) {
    console.error('Error in job automation processing:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
