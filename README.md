# 🎬 YTGrab — YouTube Video Downloader

A fast, dark-themed YouTube video downloader web app. Supports all video qualities (144p to 4K), MP4 and MP3 download.

---

## 📁 Project Structure

```
ytgrab/
├── public/
│   ├── index.html      ← Frontend HTML
│   ├── style.css       ← Dark modern styles
│   └── app.js          ← Frontend JavaScript
├── server.js           ← Node.js Express backend
├── package.json
├── .gitignore
└── README.md
```

---

## ⚙️ Requirements

- **Node.js** v18 or higher → https://nodejs.org
- **yt-dlp** → https://github.com/yt-dlp/yt-dlp
- **ffmpeg** (for merging audio+video) → https://ffmpeg.org

---

## 🚀 Local Setup (Run on Your Computer)

### Step 1 — Install yt-dlp

**Windows:**
```bash
winget install yt-dlp
```
or download `yt-dlp.exe` from https://github.com/yt-dlp/yt-dlp/releases and add to PATH.

**Mac:**
```bash
brew install yt-dlp
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt install yt-dlp
# or
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### Step 2 — Install ffmpeg

**Windows:** https://ffmpeg.org/download.html (add to PATH)

**Mac:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt install ffmpeg
```

### Step 3 — Install Node dependencies

```bash
npm install
```

### Step 4 — Start the server

```bash
npm start
```

Open your browser and visit: **http://localhost:3000**

---

## ☁️ Deploy to a Server (VPS — Ubuntu)

### Step 1 — Connect to your VPS

```bash
ssh root@YOUR_SERVER_IP
```

### Step 2 — Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Step 3 — Install yt-dlp & ffmpeg

```bash
sudo apt install ffmpeg -y
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### Step 4 — Clone your GitHub repo

```bash
git clone https://github.com/YOUR_USERNAME/ytgrab.git
cd ytgrab
npm install
```

### Step 5 — Run with PM2 (keep it running 24/7)

```bash
npm install -g pm2
pm2 start server.js --name ytgrab
pm2 save
pm2 startup
```

### Step 6 — Setup Nginx (optional, for domain + port 80)

```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/ytgrab
```

Paste this config (replace `yourdomain.com`):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ytgrab /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 7 — Free SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

---

## 🌐 Deploy to Railway.app (Easy Cloud Deploy)

1. Push code to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Select your repo
4. Railway auto-detects Node.js and runs `npm start`
5. Add a custom domain in Railway settings

> ⚠️ Note: Railway free tier may not have yt-dlp installed. You may need a Dockerfile.

---

## 🐳 Docker (Optional)

Create a `Dockerfile`:
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y python3 ffmpeg curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t ytgrab .
docker run -p 3000:3000 ytgrab
```

---

## ⚠️ Legal Notice

This tool is for **personal use only**. Please respect YouTube's Terms of Service and copyright laws. Do not download or distribute copyrighted content without permission.

---

## 📄 License

MIT License — free to use and modify.
