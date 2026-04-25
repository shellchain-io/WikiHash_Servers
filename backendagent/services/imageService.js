const axios = require("axios");

const IMAGE_STORAGE_URL = process.env.IMAGE_STORAGE_URL || "https://mediastorage.wikihash.io";

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
  try {
    console.log(`  📸 Fetching from Unsplash: "${topic}"...`);
    const response = await axios.get("https://api.unsplash.com/search/photos", {
      params: {
        query: topic,
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
      
      console.log(`  ✓ Unsplash image by ${photo.user.name}`);
      return {
        url: imageUrl || photo.urls.regular,
        alt: photo.alt_description || topic,
        credit: photo.user.name,
        creditLink: photo.user.links.html,
      };
    }
    console.error(`  ✗ No Unsplash images found for "${topic}"`);
    return null;
  } catch (error) {
    console.error(`  ✗ Unsplash API Error: ${error.message}`);
    return null;
  }
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
};
