const admin = require("firebase-admin");

const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CERT_URL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function saveArticle(article) {
  try {
    const docRef = await db.collection("articles").add({
      ...article,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`Article saved with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error("Error saving article to Firebase:", error);
    throw error;
  }
}

async function getAllArticles() {
  try {
    const snapshot = await db.collection("articles")
      .orderBy("createdAt", "desc")
      .get();
    
    const articles = [];
    snapshot.forEach((doc) => {
      articles.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    return articles;
  } catch (error) {
    console.error("Error fetching articles:", error);
    throw error;
  }
}

async function getFeaturedArticle() {
  try {
    const snapshot = await db.collection("articles")
      .where("featured", "==", true)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    };
  } catch (error) {
    console.error("Error fetching featured article:", error);
    throw error;
  }
}

async function setFeaturedArticle(articleId) {
  try {
    const batch = db.batch();
    
    const currentFeatured = await db.collection("articles")
      .where("featured", "==", true)
      .get();
    
    currentFeatured.forEach((doc) => {
      batch.update(doc.ref, { featured: false });
    });
    
    const articleRef = db.collection("articles").doc(articleId);
    batch.update(articleRef, { featured: true });
    
    await batch.commit();
    console.log(`Article ${articleId} set as featured`);
  } catch (error) {
    console.error("Error setting featured article:", error);
    throw error;
  }
}

async function getTopArticleByEngagement() {
  try {
    const articlesSnapshot = await db.collection("articles").get();
    const articles = [];
    
    for (const doc of articlesSnapshot.docs) {
      const articleData = doc.data();
      const analyticsDoc = await db.collection("analytics").doc(articleData.slug || doc.id).get();
      
      const analytics = analyticsDoc.exists ? analyticsDoc.data() : { views: 0, likes: 0 };
      const engagementScore = (analytics.views || 0) + (analytics.likes || 0) * 10;
      
      articles.push({
        id: doc.id,
        slug: articleData.slug || doc.id,
        engagementScore,
        ...articleData,
      });
    }
    
    articles.sort((a, b) => b.engagementScore - a.engagementScore);
    
    return articles.length > 0 ? articles[0] : null;
  } catch (error) {
    console.error("Error getting top article by engagement:", error);
    throw error;
  }
}

async function getUsedTopics() {
  try {
    const snapshot = await db.collection("articles")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    
    const topics = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.title) {
        topics.add(data.title.toLowerCase().trim());
      }
    });
    
    return Array.from(topics);
  } catch (error) {
    console.error("Error getting used topics:", error);
    return [];
  }
}

async function getUsedImageUrls() {
  try {
    const snapshot = await db.collection("articles")
      .orderBy("createdAt", "desc")
      .limit(200) // Increased to track more articles
      .get();
    
    const imageUrls = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Add featured image
      if (data.featuredImage) {
        imageUrls.add(data.featuredImage);
      }
      if (data.image) {
        imageUrls.add(data.image);
      }
      
      // Extract images from HTML content
      if (data.content) {
        const imgRegex = /<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi;
        let match;
        while ((match = imgRegex.exec(data.content)) !== null) {
          imageUrls.add(match[1]);
        }
      }
    });
    
    console.log(`📊 Found ${imageUrls.size} unique image URLs from recent articles`);
    return Array.from(imageUrls);
  } catch (error) {
    console.error("Error getting used image URLs:", error);
    return [];
  }
}

async function storeArticleImages(articleId, article) {
  try {
    const imageUrls = new Set();
    
    // Add featured image
    if (article.featuredImage) {
      imageUrls.add(article.featuredImage);
    }
    if (article.image) {
      imageUrls.add(article.image);
    }
    
    // Extract images from HTML content
    if (article.content) {
      const imgRegex = /<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi;
      let match;
      while ((match = imgRegex.exec(article.content)) !== null) {
        imageUrls.add(match[1]);
      }
    }
    
    // Store in a separate collection for better tracking
    const imageTrackingRef = db.collection("imageTracking").doc(articleId);
    await imageTrackingRef.set({
      articleId,
      imageUrls: Array.from(imageUrls),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`📸 Stored ${imageUrls.size} image URLs for article ${articleId}`);
  } catch (error) {
    console.error("Error storing article images:", error);
  }
}

async function getFirestoreDoc(collection, docId) {
  try {
    const docRef = db.collection(collection).doc(docId);
    const doc = await docRef.get();
    
    if (doc.exists) {
      return doc.data();
    }
    return null;
  } catch (error) {
    console.error(`Error getting document ${collection}/${docId}:`, error);
    return null;
  }
}

// SEO Keywords Management Functions
async function getSeoKeywords() {
  try {
    const snapshot = await db.collection("seoKeywords")
      .orderBy("createdAt", "desc")
      .get();
    
    const keywords = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      keywords.push({
        id: doc.id,
        keyword: data.keyword,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      });
    });
    
    // Return just the keyword strings for AI service
    const keywordStrings = keywords.map(item => item.keyword);
    console.log(`📊 Retrieved ${keywordStrings.length} SEO keywords from Firebase`);
    return keywordStrings;
  } catch (error) {
    console.error("Error getting SEO keywords:", error);
    // Fallback to config if Firebase fails
    const config = require("../config.json");
    return config.seoKeywords || [];
  }
}

async function addSeoKeyword(keyword) {
  try {
    const keywordRef = db.collection("seoKeywords").doc();
    await keywordRef.set({
      keyword: keyword.trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`✅ Added SEO keyword: "${keyword}"`);
    return keywordRef.id;
  } catch (error) {
    console.error("Error adding SEO keyword:", error);
    throw error;
  }
}

async function updateSeoKeyword(keywordId, keyword) {
  try {
    const keywordRef = db.collection("seoKeywords").doc(keywordId);
    await keywordRef.update({
      keyword: keyword.trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`✅ Updated SEO keyword: "${keyword}"`);
    return true;
  } catch (error) {
    console.error("Error updating SEO keyword:", error);
    throw error;
  }
}

async function deleteSeoKeyword(keywordId) {
  try {
    const keywordRef = db.collection("seoKeywords").doc(keywordId);
    await keywordRef.delete();
    
    console.log(`✅ Deleted SEO keyword with ID: ${keywordId}`);
    return true;
  } catch (error) {
    console.error("Error deleting SEO keyword:", error);
    throw error;
  }
}

async function bulkImportSeoKeywords(keywords) {
  try {
    const batch = db.batch();
    const results = [];
    
    keywords.forEach(keyword => {
      if (keyword && keyword.trim()) {
        const keywordRef = db.collection("seoKeywords").doc();
        batch.set(keywordRef, {
          keyword: keyword.trim(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        results.push(keywordRef.id);
      }
    });
    
    await batch.commit();
    console.log(`✅ Bulk imported ${results.length} SEO keywords`);
    return results;
  } catch (error) {
    console.error("Error bulk importing SEO keywords:", error);
    throw error;
  }
}

module.exports = {
  saveArticle,
  getAllArticles,
  getFeaturedArticle,
  setFeaturedArticle,
  getTopArticleByEngagement,
  getUsedTopics,
  getUsedImageUrls,
  storeArticleImages,
  getFirestoreDoc,
  getSeoKeywords,
  addSeoKeyword,
  updateSeoKeyword,
  deleteSeoKeyword,
  bulkImportSeoKeywords,
  db,
};
