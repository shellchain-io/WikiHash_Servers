require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { generateArticle } = require("./services/articleGenerator");
const {
  getAllArticles,
  getFeaturedArticle,
  setFeaturedArticle,
  getTopArticleByEngagement,
  getFirestoreDoc,
} = require("./services/firebaseService");
const config = require("./config.json");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

let agentRunning = false;
let agentInterval = null;
let featuredRotationInterval = null;
let isAutomationEnabled = false;
let generationIntervalTime = 3600000; // Default 1 hour

async function runAgent() {
  if (agentRunning) {
    console.log("Agent already running, skipping...");
    return;
  }

  try {
    agentRunning = true;
    console.log("\n🤖 Agent started at", new Date().toISOString());
    
    await generateArticle();
    
    if (!config.featuredArticle.manualOverride) {
      const articles = await getAllArticles();
      if (articles.length > 0) {
        await setFeaturedArticle(articles[0].id);
        console.log("✨ Latest article set as featured");
      }
    }
    
    console.log("✅ Agent cycle completed\n");
  } catch (error) {
    console.error("❌ Agent error:", error.message);
  } finally {
    agentRunning = false;
  }
}

async function rotateFeaturedArticle() {
  try {
    if (config.featuredArticle.manualOverride) {
      console.log("⏭️  Featured article is locked, skipping rotation");
      return;
    }
    
    console.log("🔄 Rotating featured article based on engagement...");
    const topArticle = await getTopArticleByEngagement();
    
    if (topArticle) {
      await setFeaturedArticle(topArticle.id);
      console.log(`✨ Featured article updated to: ${topArticle.title} (Score: ${topArticle.engagementScore})`);
    }
  } catch (error) {
    console.error("❌ Error rotating featured article:", error.message);
  }
}

// Fetch settings from Firebase
async function fetchFirebaseSettings() {
  try {
    const settingsDoc = await getFirestoreDoc('settings', 'global');
    
    if (settingsDoc) {
      const newAutomationEnabled = settingsDoc.automationEnabled ?? false;
      const newIntervalTime = (settingsDoc.generationInterval ?? 3600) * 1000; // Convert to ms
      
      // Check if settings changed
      if (newAutomationEnabled !== isAutomationEnabled || newIntervalTime !== generationIntervalTime) {
        isAutomationEnabled = newAutomationEnabled;
        generationIntervalTime = newIntervalTime;
        
        console.log(`⚙️  Settings updated: Automation=${isAutomationEnabled}, Interval=${generationIntervalTime/1000}s`);
        
        // Restart automation with new settings
        stopAgent();
        if (isAutomationEnabled) {
          startAgent();
        }
      }
    } else {
      console.log('📝 No settings found in Firebase, automation disabled by default');
      isAutomationEnabled = false;
    }
  } catch (error) {
    console.error('❌ Error fetching Firebase settings:', error.message);
  }
}

function startAgent() {
  const interval = generationIntervalTime || parseInt(process.env.ARTICLE_GENERATION_INTERVAL) || 120000;
  const featuredRotationTime = 10 * 60 * 1000;
  
  console.log(`🚀 Starting agent with ${interval / 1000}s interval`);
  console.log(`🔄 Featured article rotation: every ${featuredRotationTime / 60000} minutes`);
  
  runAgent();
  rotateFeaturedArticle();
  
  agentInterval = setInterval(runAgent, interval);
  featuredRotationInterval = setInterval(rotateFeaturedArticle, featuredRotationTime);
}

function stopAgent() {
  if (agentInterval) {
    clearInterval(agentInterval);
    agentInterval = null;
  }
  if (featuredRotationInterval) {
    clearInterval(featuredRotationInterval);
    featuredRotationInterval = null;
  }
  console.log("🛑 Agent stopped");
}

// Health check endpoint for admin panel
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    automation: isAutomationEnabled,
    interval: generationIntervalTime / 1000,
    agentRunning: agentInterval !== null,
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "Backend Agent API is running",
    status: agentInterval ? "active" : "stopped",
    automation: isAutomationEnabled,
    config: {
      interval: generationIntervalTime / 1000,
      categories: config.categories,
    },
  });
});

app.get("/api/articles", async (req, res) => {
  try {
    const articles = await getAllArticles();
    res.json({ success: true, articles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/articles/featured", async (req, res) => {
  try {
    const article = await getFeaturedArticle();
    res.json({ success: true, article });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/articles/featured/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await setFeaturedArticle(id);
    
    config.featuredArticle.manualOverride = true;
    config.featuredArticle.currentFeaturedId = id;
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
    
    res.json({ success: true, message: "Featured article updated" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/articles/featured/unlock", async (req, res) => {
  try {
    config.featuredArticle.manualOverride = false;
    config.featuredArticle.currentFeaturedId = null;
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
    
    res.json({ success: true, message: "Featured article unlocked" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const article = await generateArticle();
    res.json({ success: true, article });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/agent/start", (req, res) => {
  if (agentInterval) {
    return res.json({ success: false, message: "Agent already running" });
  }
  startAgent();
  res.json({ success: true, message: "Agent started" });
});

app.post("/api/agent/stop", (req, res) => {
  stopAgent();
  res.json({ success: true, message: "Agent stopped" });
});

// Webhook to refresh settings immediately when admin panel updates them
app.post("/api/settings/refresh", async (req, res) => {
  try {
    console.log("⚡ Settings refresh triggered by admin panel");
    await fetchFirebaseSettings();
    res.json({ 
      success: true, 
      message: "Settings refreshed",
      automation: isAutomationEnabled,
      interval: generationIntervalTime / 1000
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('📡 Fetching automation settings from Firebase...');
  
  // Fetch settings on startup
  await fetchFirebaseSettings();
  
  // Check for settings updates every 30 seconds
  setInterval(fetchFirebaseSettings, 30000);
  
  console.log('✅ Backend agent ready!');
  console.log(`⚙️  Automation: ${isAutomationEnabled ? 'ENABLED' : 'DISABLED'}`);
  
  // Only start agent if automation is enabled
  if (!isAutomationEnabled) {
    console.log('💤 Automation is disabled. Enable it in the admin panel to start generating articles.');
  }
});
