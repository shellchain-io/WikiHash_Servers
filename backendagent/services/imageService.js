const axios = require("axios");

const IMAGE_STORAGE_URL = process.env.IMAGE_STORAGE_URL || "https://mediastorage.wikihash.io";

// Optimized one-word categories for Unsplash
const unsplashOptimizedCategories = {
  // Crypto specific terms
  "ethereum": "ethereum",
  "bitcoin": "bitcoin", 
  "nft": "nft",
  "web3": "technology",
  "defi": "finance",
  "crypto": "cryptocurrency",
  "blockchain": "blockchain",
  "altcoins": "cryptocurrency",
  "solana": "technology",
  "ripple": "finance",
  "cardano": "technology",
  "binance": "finance",
  
  // General terms that work well with Unsplash
  "market": "finance",
  "trading": "finance", 
  "investment": "finance",
  "technology": "technology",
  "innovation": "technology",
  "digital": "technology",
  "network": "network",
  "security": "security",
  "data": "data",
  "analysis": "business",
  "business": "business",
  "economy": "economy",
  "money": "money",
  "banking": "finance",
  "payment": "finance",
  
  // Visual concepts
  "trends": "graph",
  "growth": "growth",
  "future": "future",
  "innovation": "innovation",
  "research": "research",
  "development": "development",
  "strategy": "business",
  "global": "global",
  "world": "world",
  "news": "media",
  "information": "data",
  "communication": "technology"
};

// Function to optimize category for Unsplash search
function optimizeCategoryForUnsplash(category) {
  const lowerCategory = category.toLowerCase();
  
  // Direct mapping first
  for (const [key, value] of Object.entries(unsplashOptimizedCategories)) {
    if (lowerCategory.includes(key)) {
      return value;
    }
  }
  
  // Extract keywords and find best match
  const keywords = lowerCategory.split(/\s+/).filter(word => word.length > 2);
  
  for (const keyword of keywords) {
    if (unsplashOptimizedCategories[keyword]) {
      return unsplashOptimizedCategories[keyword];
    }
  }
  
  // Fallback to common tech/finance terms
  if (lowerCategory.includes('tech') || lowerCategory.includes('digital') || lowerCategory.includes('software')) {
    return 'technology';
  }
  if (lowerCategory.includes('finance') || lowerCategory.includes('money') || lowerCategory.includes('investment')) {
    return 'finance';
  }
  if (lowerCategory.includes('market') || lowerCategory.includes('trading') || lowerCategory.includes('business')) {
    return 'business';
  }
  
  // Last resort - use first meaningful word
  const meaningfulWord = keywords.find(word => 
    unsplashOptimizedCategories[word] || 
    ['technology', 'finance', 'business', 'data', 'network', 'digital'].includes(word)
  );
  
  return meaningfulWord || 'technology'; // Ultimate fallback
}

// Generate alternative search terms if original fails
function generateAlternativeSearchTerms(originalCategory, failedTerms = []) {
  const baseCategory = optimizeCategoryForUnsplash(originalCategory);
  const alternatives = [];
  
  // Add some related terms based on context
  if (baseCategory === 'technology') {
    alternatives.push('innovation', 'digital', 'computer', 'software', 'network');
  } else if (baseCategory === 'finance') {
    alternatives.push('money', 'investment', 'banking', 'trading', 'economy');
  } else if (baseCategory === 'business') {
    alternatives.push('office', 'corporate', 'strategy', 'meeting', 'professional');
  } else if (baseCategory === 'cryptocurrency') {
    alternatives.push('bitcoin', 'blockchain', 'trading', 'finance', 'technology');
  } else if (baseCategory === 'data') {
    alternatives.push('analytics', 'information', 'research', 'statistics', 'graph');
  }
  
  // Filter out already tried terms
  return alternatives.filter(term => !failedTerms.includes(term));
}

async function uploadToImageStorage(imageUrl) {
  try {
    const response = await axios.post(`${IMAGE_STORAGE_URL}/upload-url`, {
      url: imageUrl,
    });

    if (response.data.success) {
      return response.data.url;
    }
    return null;
  } catch (error) {
    console.error("Error uploading to image storage:", error.message);
    return null;
  }
}

async function uploadBase64ToImageStorage(base64Data, filename) {
  try {
    const response = await axios.post(`${IMAGE_STORAGE_URL}/upload-base64`, {
      image: base64Data,
      filename,
    });

    if (response.data.success) {
      return response.data.url;
    }
    return null;
  } catch (error) {
    console.error("Error uploading base64 to image storage:", error.message);
    return null;
  }
}

async function getUnsplashImage(topic) {
  const optimizedTopic = optimizeCategoryForUnsplash(topic);
  const failedTerms = [];
  const maxAttempts = 5; // Increased attempts with alternative terms
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let searchTopic = optimizedTopic;
    
    // If first attempt failed, try alternative terms
    if (attempt > 0) {
      const alternatives = generateAlternativeSearchTerms(topic, failedTerms);
      if (alternatives.length === 0) {
        console.log(`  ⚠️  No more alternative search terms available`);
        break;
      }
      searchTopic = alternatives[0];
      failedTerms.push(searchTopic);
    }
    
    try {
      console.log(`  📸 Fetching from Unsplash (attempt ${attempt + 1}): "${searchTopic}"...`);
      const response = await axios.get("https://api.unsplash.com/search/photos", {
        params: {
          query: searchTopic,
          per_page: 10,
          orientation: "landscape",
        },
        headers: {
          Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
        },
      });

      if (response.data.results.length > 0) {
        const randomIndex = Math.floor(Math.random() * response.data.results.length);
        const photo = response.data.results[randomIndex];
        
        const imageUrl = await uploadToImageStorage(photo.urls.regular);
        
        console.log(`  ✓ Unsplash image by ${photo.user.name} (search term: "${searchTopic}")`);
        return {
          url: imageUrl || photo.urls.regular,
          alt: photo.alt_description || searchTopic,
          credit: photo.user.name,
          creditLink: photo.user.links.html,
        };
      }
      console.log(`  ⚠️  No Unsplash images found for "${searchTopic}"`);
    } catch (error) {
      console.error(`  ✗ Unsplash API Error for "${searchTopic}": ${error.message}`);
      if (attempt === 0) {
        failedTerms.push(searchTopic);
      }
    }
  }
  
  console.error(`  ✗ Failed to get Unsplash image after ${maxAttempts} attempts`);
  return null;
}

async function generateAIImage(prompt) {
  try {
    console.log(`  🎨 Generating AI image: "${prompt}"...`);
    const cleanPrompt = `${prompt}, professional photography, high quality, detailed, no text, no words, no letters, abstract concept, visual representation`;
    
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
      {
        prompt: cleanPrompt,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    const base64Image = Buffer.from(response.data, "binary").toString("base64");
    const base64Data = `data:image/png;base64,${base64Image}`;
    const filename = `ai-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    
    const imageUrl = await uploadBase64ToImageStorage(base64Data, filename);
    
    console.log(`  ✓ AI image generated successfully`);
    return {
      url: imageUrl || base64Data,
      alt: prompt,
      credit: "AI Generated",
      creditLink: null,
    };
  } catch (error) {
    console.error(`  ✗ Cloudflare AI Image Error: ${error.message}`);
    return null;
  }
}

async function getArticleImages(topic, count = 1, usedImageUrls = []) {
  const images = [];
  const useUnsplash = Math.random() < 0.8;
  const maxRetries = 3;

  console.log(`\n🖼️  Image Strategy: ${useUnsplash ? 'Unsplash (80%)' : 'AI Generated (20%)'}`);

  for (let i = 0; i < count; i++) {
    console.log(`\nImage ${i + 1}/${count}:`);
    let image;
    let retries = 0;
    
    while (retries < maxRetries) {
      if (useUnsplash) {
        image = await getUnsplashImage(topic);
        if (!image) {
          console.log(`  ⚠️  Unsplash failed, falling back to AI...`);
          image = await generateAIImage(topic);
        }
      } else {
        image = await generateAIImage(topic);
        if (!image) {
          console.log(`  ⚠️  AI failed, falling back to Unsplash...`);
          image = await getUnsplashImage(topic);
        }
      }
      
      if (image && !usedImageUrls.includes(image.url)) {
        break;
      }
      
      console.log("  ⚠️  Generated duplicate image, retrying...");
      retries++;
      image = null;
    }

    if (image) {
      images.push(image);
      console.log(`  ✅ Image added: ${image.credit}`);
    } else {
      console.log(`  ❌ Failed to get image after ${maxRetries} retries`);
    }
  }

  return images;
}

module.exports = {
  getArticleImages,
  optimizeCategoryForUnsplash,
  generateAlternativeSearchTerms,
};
