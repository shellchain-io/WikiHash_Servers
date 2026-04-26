const { generateArticleContent, generateTopicIdea } = require("./aiService");
const { getArticleImages } = require("./imageService");
const { saveArticle, getUsedTopics, getUsedImageUrls } = require("./firebaseService");
const config = require("../config.json");

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function shouldIncludeFeature(probability) {
  return Math.random() < probability;
}

async function generateArticle() {
  try {
    console.log("Fetching used topics and images...");
    const [usedTopics, usedImageUrls] = await Promise.all([
      getUsedTopics(),
      getUsedImageUrls()
    ]);
    
    console.log(`Found ${usedTopics.length} recent topics and ${usedImageUrls.length} used images`);
    
    console.log("Starting article generation...");
    
    console.log("Generating topic idea...");
    const { title, category } = await generateTopicIdea(
      config.categories,
      config.newsSources,
      usedTopics
    );
    
    console.log(`Topic: ${title}`);
    console.log(`Category: ${category}`);
    
    const isShortPost = shouldIncludeFeature(config.articleSettings.shortPostProbability);
    const wordCount = isShortPost
      ? config.articleSettings.minLength
      : Math.floor(
          Math.random() * (config.articleSettings.maxLength - config.articleSettings.minLength) +
            config.articleSettings.minLength
        );
    
    const includeTable = shouldIncludeFeature(config.articleSettings.includeTableProbability);
    const includeYouTube = shouldIncludeFeature(config.articleSettings.includeYouTubeProbability);
    const includeExternalLinks = shouldIncludeFeature(config.articleSettings.includeExternalLinksProbability);
    const noImage = shouldIncludeFeature(config.articleSettings.noImageProbability);
    const imageCount = noImage ? 0 : (shouldIncludeFeature(config.articleSettings.twoImageProbability) ? 2 : 1);
    
    const prompt = `Write a comprehensive article about: "${title}"

Requirements:
- Target word count: approximately ${wordCount} words
- Category: ${category}
- Use proper HTML formatting with semantic tags
- Include <h2> and <h3> headings for structure
- Use <p> tags for paragraphs
- Use <strong> and <em> for emphasis
- Include <ul> or <ol> lists where appropriate
${includeTable ? "- Include a relevant HTML <table> with <thead>, <tbody>, and <caption>" : ""}
${includeYouTube ? "- Include ONE relevant YouTube video embed that is directly related to the topic. Use a real, existing YouTube video URL in this format: <div class='video-wrapper'><iframe src='https://www.youtube.com/embed/VIDEO_ID' frameborder='0' allowfullscreen></iframe></div>. IMPORTANT: Only include a video if you can provide a real, working YouTube video ID that is relevant to the topic." : ""}
${includeExternalLinks ? "- Include 2-3 external links to reputable sources with <a href='...' target='_blank' rel='noopener noreferrer'>" : ""}
- Use <blockquote> with <cite> for important quotes
- Add <abbr> tags for technical terms
- Use <mark> to highlight key points occasionally
- Include a references section at the end if you cite sources

Write engaging, informative content that provides real value to readers interested in ${category}.
Do NOT include placeholder text like [Image] or [Video]. I will add those separately.
Return ONLY the HTML content, no markdown code blocks.`;

    console.log("Generating article content with AI...");
    let content = await generateArticleContent(prompt);
    
    content = content.replace(/```html\n?/g, "").replace(/```\n?/g, "").trim();
    
    let featuredImage = null;
    const images = [];
    
    if (imageCount > 0) {
      console.log(`Fetching ${imageCount} image(s)...`);
      const fetchedImages = await getArticleImages(title, imageCount, usedImageUrls);
      images.push(...fetchedImages);
      
      if (images.length > 0) {
        featuredImage = images[0].url;
      }
    } else {
      console.log("No images for this article (10% probability)");
    }
    
    if (images.length > 1) {
      const contentImages = images.slice(1);
      const imageHtml = contentImages.map((img) => {
        return `<figure>
  <img src="${img.url}" alt="${img.alt}" loading="lazy" />
  <figcaption>${img.alt}${img.credit ? ` — Photo: ${img.credit}` : ""}</figcaption>
</figure>`;
      }).join("\n\n");
      
      const firstH2Index = content.indexOf("<h2>");
      if (firstH2Index !== -1) {
        content = content.slice(0, firstH2Index) + imageHtml + "\n\n" + content.slice(firstH2Index);
      } else {
        content = imageHtml + "\n\n" + content;
      }
    }
    
    const description = content
      .replace(/<[^>]*>/g, "")
      .split(".")
      .slice(0, 2)
      .join(".")
      .trim()
      .substring(0, 200) + "...";
    
    const tags = [category.toLowerCase()];
    const categoryWords = category.toLowerCase().split(" ");
    tags.push(...categoryWords);
    
    const article = {
      slug: generateSlug(title),
      title,
      description,
      author: "WikiHash",
      date: new Date().toISOString().split("T")[0],
      category,
      tags: [...new Set(tags)],
      image: featuredImage || "/images/default-crypto.jpg",
      content,
      featured: false,
      views: 0,
      likes: 0,
    };
    
    console.log("Saving article to Firebase...");
    const articleId = await saveArticle(article);
    
    console.log(`✅ Article generated successfully! ID: ${articleId}`);
    return { ...article, id: articleId };
    
  } catch (error) {
    console.error("Error generating article:", error);
    throw error;
  }
}

module.exports = {
  generateArticle,
};
