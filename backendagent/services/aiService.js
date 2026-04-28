const Groq = require("groq-sdk");
const { GoogleGenAI } = require("@google/genai");
const { getSeoKeywords, getCategories, getNewsSources } = require("./firebaseService");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Function to select all keywords systematically for content
async function selectAllKeywords(category, topic) {
  const allKeywords = await getSeoKeywords();
  
  // Create a relevance score for each keyword
  const keywordScores = allKeywords.map(keyword => {
    let score = 0;
    const lowerKeyword = keyword.toLowerCase();
    const lowerCategory = category.toLowerCase();
    const lowerTopic = topic.toLowerCase();
    
    // Score based on category match
    if (lowerCategory.includes('defi') && lowerKeyword.includes('defi')) score += 3;
    if (lowerCategory.includes('nft') && lowerKeyword.includes('nft')) score += 3;
    if (lowerCategory.includes('bitcoin') && lowerKeyword.includes('bitcoin')) score += 3;
    if (lowerCategory.includes('ethereum') && lowerKeyword.includes('ethereum')) score += 3;
    if (lowerCategory.includes('web3') && lowerKeyword.includes('web3')) score += 3;
    if (lowerCategory.includes('blockchain') && lowerKeyword.includes('blockchain')) score += 3;
    
    // Score based on topic match
    const topicWords = lowerTopic.split(/\s+/);
    topicWords.forEach(word => {
      if (lowerKeyword.includes(word) && word.length > 3) {
        score += 2;
      }
    });
    
    // Score based on general crypto relevance
    if (lowerKeyword.includes('crypto') || lowerKeyword.includes('blockchain')) score += 1;
    
    return { keyword, score };
  });
  
  // Sort by score but return ALL keywords (not just top 3)
  keywordScores.sort((a, b) => b.score - a.score);
  
  // Return all keywords, prioritized by relevance
  return keywordScores.map(item => item.keyword);
}

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
      model: "llama-3.1-8b-instant", // Cheaper, faster model - uses fewer tokens and costs less
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

async function generateArticleContent(prompt, category = "", topic = "") {
  // Select ALL SEO keywords systematically
  const allSelectedKeywords = await selectAllKeywords(category, topic);
  console.log(`🔍 Including ALL SEO keywords in content: ${allSelectedKeywords.join(', ')}`);
  
  // Enhance the prompt with keyword instructions
  const enhancedPrompt = `${prompt}

SEO REQUIREMENTS:
IMPORTANT: Include ALL of the following keywords naturally throughout your article content where they make sense and flow naturally:
- ${allSelectedKeywords.join('\n- ')}

Guidelines for keyword integration:
- Weave these keywords naturally into sentences, don't force them
- Use them in headings, subheadings, or important points when relevant
- Ensure they enhance the content rather than feel stuffed
- Maintain readability and professional tone
- Use variations of keywords when appropriate
- Try to include each keyword at least once where contextually appropriate

Write the article as if you're targeting readers interested in these specific crypto/blockchain topics while maintaining journalistic quality.`;

  let content = null;
  // let content = await generateWithGroq(enhancedPrompt);
  
  if (!content) {
    console.log("Groq failed, falling back to Gemini...");
    content = await generateWithGemini(enhancedPrompt);
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
  // If categories/newsSources are arrays, use them directly; otherwise fetch from Firebase
  let categoriesList = Array.isArray(categories) ? categories : await getCategories();
  let newsSourcesList = Array.isArray(newsSources) ? newsSources : await getNewsSources();
  
  const category = categoriesList[Math.floor(Math.random() * categoriesList.length)];
  
  // Select a random SEO keyword for the title from Firebase
  const allKeywords = await getSeoKeywords();
  const randomKeyword = allKeywords.length > 0 
    ? allKeywords[Math.floor(Math.random() * allKeywords.length)]
    : "";
  
  const usedTopicsText = usedTopics.length > 0 
    ? `\n\nAVOID these recently used topics:\n${usedTopics.slice(0, 20).map(t => `- ${t}`).join('\n')}`
    : '';
  
  const prompt = `Generate a specific, trending article topic idea related to "${category}". 
  The topic should be:
  - Current and relevant to ${new Date().getFullYear()}
  - Specific enough to write a detailed article
  - Interesting to crypto/blockchain enthusiasts
  - UNIQUE and different from recently published articles${usedTopicsText}
  - IMPORTANT: Include the keyword "${randomKeyword}" naturally in the title for SEO purposes
  
  Examples of how to include keywords:
  - If keyword is "decentralized finance": "DeFi Revolution: How Decentralized Finance is Changing Banking"
  - If keyword is "blockchain technology": "Blockchain Technology Breakthrough: New Protocol Launch"
  - If keyword is "NFT marketplace": "NFT Marketplace Surge: Trading Volume Hits New High"
  
  Respond with ONLY the topic title, nothing else. Keep it under 100 characters.`;

  let topic = null
  // let topic = await generateWithGroq(prompt);
  
  if (!topic) {
    topic = await generateWithGemini(prompt);
  }

  const cleanTitle = topic ? topic.trim().replace(/^["']|["']$/g, "") : `${category}: Latest ${randomKeyword} Developments`;
  
  if (usedTopics.some(used => used.toLowerCase() === cleanTitle.toLowerCase())) {
    console.log("⚠️  Generated duplicate topic, retrying...");
    return generateTopicIdea(categories, newsSources, usedTopics);
  }

  console.log(`🔑 Generated title with keyword "${randomKeyword}": ${cleanTitle}`);

  return {
    title: cleanTitle,
    category,
  };
}

module.exports = {
  generateArticleContent,
  generateTopicIdea,
};
