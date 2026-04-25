const Groq = require("groq-sdk");
const { GoogleGenAI } = require("@google/genai");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function generateWithGroq(prompt) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert crypto and blockchain journalist. Write engaging, informative articles with proper HTML formatting including headings, paragraphs, lists, tables when appropriate, and blockquotes for important points.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.8,
      max_tokens: 4000,
    });

    return completion.choices[0]?.message?.content || null;
  } catch (error) {
    console.error("Groq API Error:", error.message);
    return null;
  }
}

async function generateWithGemini(prompt) {
  const models = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-pro-latest"
  ];
  
  const fullPrompt = `You are an expert crypto and blockchain journalist. Write engaging, informative articles with proper HTML formatting including headings, paragraphs, lists, tables when appropriate, and blockquotes for important points.

${prompt}`;
  
  for (const model of models) {
    try {
      console.log(`Trying Gemini model: ${model}...`);
      const response = await genAI.models.generateContent({
        model: model,
        contents: fullPrompt,
        config: {
          temperature: 0.8,
          maxOutputTokens: 4000,
        }
      });
      
      console.log(`✓ Success with ${model}`);
      return response.text;
    } catch (error) {
      console.log(`✗ ${model} failed: ${error.message || JSON.stringify(error)}`);
      continue;
    }
  }
  
  console.error("All Gemini models failed");
  return null;
}

async function validateYouTubeLink(url) {
  try {
    const videoIdMatch = url.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!videoIdMatch) return false;
    
    const videoId = videoIdMatch[1];
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    
    return response.ok;
  } catch (error) {
    console.error("YouTube validation error:", error.message);
    return false;
  }
}

async function generateArticleContent(prompt) {
  let content = await generateWithGroq(prompt);
  
  if (!content) {
    console.log("Groq failed, falling back to Gemini...");
    content = await generateWithGemini(prompt);
  }

  if (!content) {
    throw new Error("Both AI services failed to generate content");
  }

  // Validate YouTube links if present
  const youtubeRegex = /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
  const youtubeMatches = content.match(youtubeRegex);
  
  if (youtubeMatches) {
    console.log("Validating YouTube links...");
    for (const match of youtubeMatches) {
      const isValid = await validateYouTubeLink(match);
      if (!isValid) {
        console.log(`Invalid/unavailable YouTube link found, removing: ${match}`);
        // Remove the entire video wrapper div containing this link
        const videoWrapperRegex = new RegExp(`<div class=['"]video-wrapper['"]>.*?${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?</div>`, 'gs');
        content = content.replace(videoWrapperRegex, '');
      } else {
        console.log(`✓ YouTube link validated: ${match}`);
      }
    }
  }

  return content;
}

async function generateTopicIdea(categories, newsSources, usedTopics = []) {
  const category = categories[Math.floor(Math.random() * categories.length)];
  
  const usedTopicsText = usedTopics.length > 0 
    ? `\n\nAVOID these recently used topics:\n${usedTopics.slice(0, 20).map(t => `- ${t}`).join('\n')}`
    : '';
  
  const prompt = `Generate a specific, trending article topic idea related to "${category}". 
  The topic should be:
  - Current and relevant to ${new Date().getFullYear()}
  - Specific enough to write a detailed article
  - Interesting to crypto/blockchain enthusiasts
  - UNIQUE and different from recently published articles${usedTopicsText}
  
  Respond with ONLY the topic title, nothing else. Keep it under 100 characters.`;

  let topic = await generateWithGroq(prompt);
  
  if (!topic) {
    topic = await generateWithGemini(prompt);
  }

  const cleanTitle = topic ? topic.trim().replace(/^["']|["']$/g, "") : `${category}: Latest Developments`;
  
  if (usedTopics.some(used => used.toLowerCase() === cleanTitle.toLowerCase())) {
    console.log("⚠️  Generated duplicate topic, retrying...");
    return generateTopicIdea(categories, newsSources, usedTopics);
  }

  return {
    title: cleanTitle,
    category,
  };
}

module.exports = {
  generateArticleContent,
  generateTopicIdea,
};
