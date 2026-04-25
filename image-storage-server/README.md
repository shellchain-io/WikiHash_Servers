# Image Storage Server

Standalone image storage server for blog articles. Runs independently from frontend and backend.

## Features

- 🖼️ **Upload images** via file upload, base64, or URL
- 🌐 **Serve images** via HTTP with CORS enabled
- 📁 **Local storage** in `uploads/` folder
- 🗑️ **Delete images** via API
- 📋 **List all images** with metadata

## Setup

```bash
npm install
```

## Run

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Default port: **3001**

## API Endpoints

### Upload Image (Multipart Form)
```bash
POST /upload
Content-Type: multipart/form-data

# Example with curl
curl -X POST http://localhost:3001/upload \
  -F "image=@/path/to/image.jpg"
```

**Response:**
```json
{
  "success": true,
  "filename": "1234567890-abc123.jpg",
  "url": "http://localhost:3001/images/1234567890-abc123.jpg",
  "path": "/images/1234567890-abc123.jpg"
}
```

### Upload Image (Base64)
```bash
POST /upload-base64
Content-Type: application/json

{
  "image": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "filename": "optional-name.png"
}
```

### Upload Image (From URL)
```bash
POST /upload-url
Content-Type: application/json

{
  "url": "https://images.unsplash.com/photo-123...",
  "filename": "optional-name.jpg"
}
```

### Get Image
```bash
GET /images/{filename}

# Example
http://localhost:3001/images/1234567890-abc123.jpg
```

### Delete Image
```bash
DELETE /images/{filename}
```

### List All Images
```bash
GET /list
```

**Response:**
```json
{
  "success": true,
  "count": 42,
  "images": [
    {
      "filename": "1234567890-abc123.jpg",
      "url": "http://localhost:3001/images/1234567890-abc123.jpg",
      "path": "/images/1234567890-abc123.jpg",
      "size": 245678
    }
  ]
}
```

## Usage in Backend Agent

Update `backendagent/.env`:
```env
IMAGE_STORAGE_URL=http://localhost:3001
```

The backend agent will upload images to this server and get back URLs to store in Firebase.

## Deployment

### On VM (Same as Backend)
```bash
# Install dependencies
npm install

# Run with PM2
pm2 start index.js --name image-storage

# Or run in background
nohup npm start > image-storage.log 2>&1 &
```

### Access from Backend
If running on same VM:
- Backend: `http://localhost:5000`
- Image Storage: `http://localhost:3001`

If on different VM:
- Use public IP: `http://YOUR_VM_IP:3001`

### CORS
Already enabled for all origins. Restrict in production if needed.

## Storage

Images are stored in `uploads/` folder. Make sure this folder has write permissions.

## License

ISC
