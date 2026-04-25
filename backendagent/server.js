const express = require('express');
const cors = require('cors');
const { generateArticle } = require('./services/articleGenerator');
const { doc, getDoc } = require('firebase/firestore');
const { db } = require('./services/firebaseService');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

let generationInterval = null;
let isAutomationEnabled = false;
let intervalTime = 3600000; // Default 1 hour in milliseconds

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'online',
    automation: isAutomationEnabled,
    interval: intervalTime / 1000
  });
});

// Fetch settings from Firebase
async function fetchSettings() {
  try {
    const settingsRef = doc(db, 'settings', 'global');
    const settingsSnap = await getDoc(settingsRef);
    
    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      const newAutomationEnabled = data.automationEnabled ?? false;
      const newIntervalTime = (data.generationInterval ?? 3600) * 1000; // Convert to ms
      
      // Check if settings changed
      if (newAutomationEnabled !== isAutomationEnabled || newIntervalTime !== intervalTime) {
        isAutomationEnabled = newAutomationEnabled;
        intervalTime = newIntervalTime;
        
        console.log(`Settings updated: Automation=${isAutomationEnabled}, Interval=${intervalTime/1000}s`);
        
        // Restart automation with new settings
        stopAutomation();
        if (isAutomationEnabled) {
          startAutomation();
        }
      }
    } else {
      console.log('No settings found in Firebase, using defaults');
      isAutomationEnabled = false;
    }
  } catch (error) {
    console.error('Error fetching settings from Firebase:', error);
  }
}

// Start automation
function startAutomation() {
  if (generationInterval) {
    clearInterval(generationInterval);
  }
  
  console.log(`Starting automation with interval: ${intervalTime / 1000} seconds`);
  
  generationInterval = setInterval(async () => {
    console.log('Running automated article generation...');
    try {
      await generateArticle();
      console.log('Article generated successfully');
    } catch (error) {
      console.error('Error generating article:', error);
    }
  }, intervalTime);
}

// Stop automation
function stopAutomation() {
  if (generationInterval) {
    clearInterval(generationInterval);
    generationInterval = null;
    console.log('Automation stopped');
  }
}

// Manual generation endpoint
app.post('/generate', async (req, res) => {
  try {
    console.log('Manual article generation triggered');
    await generateArticle();
    res.json({ success: true, message: 'Article generated successfully' });
  } catch (error) {
    console.error('Error generating article:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`Backend agent server running on port ${PORT}`);
  console.log('Fetching initial settings from Firebase...');
  
  // Fetch settings on startup
  await fetchSettings();
  
  // Check for settings updates every 30 seconds
  setInterval(fetchSettings, 30000);
  
  console.log('Backend agent ready!');
});
