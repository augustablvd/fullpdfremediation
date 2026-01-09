# Deployment Guide

This guide covers deploying the PDF Accessibility Tagger to various cloud platforms.

## Recommended: Render (Free)

**Best for**: Quick deployment with free tier

### Steps:
1. Fork this repository to your GitHub account
2. Go to [render.com](https://render.com) and sign up
3. Click "New +" → "Web Service"
4. Connect your GitHub account and select this repository
5. Render will auto-detect the settings from `render.yaml`
6. Click "Create Web Service"
7. Wait 2-3 minutes for deployment
8. Your app will be live at: `https://your-app-name.onrender.com`

### Configuration:
- **Build Command**: `pip install -r requirements.txt` (auto-detected)
- **Start Command**: `gunicorn app:app` (auto-detected)
- **Environment**: Python 3.11.6

---

## Railway (Free Trial)

**Best for**: Automatic deployments and simple setup

### Steps:
1. Fork this repository
2. Go to [railway.app](https://railway.app)
3. Sign in with GitHub
4. Click "New Project" → "Deploy from GitHub repo"
5. Select your repository
6. Railway automatically detects and deploys
7. Click the generated URL to access your app

### Features:
- Automatic deployments on git push
- Free $5 credit to start
- Built-in monitoring

---

## Heroku

**Best for**: Traditional PaaS experience

### Prerequisites:
- Heroku account
- Heroku CLI installed

### Steps:

```bash
# Login to Heroku
heroku login

# Create app
heroku create your-pdf-tagger-app

# Set environment variables
heroku config:set SECRET_KEY=$(openssl rand -hex 32)
heroku config:set FLASK_DEBUG=False

# Deploy
git push heroku main

# Open app
heroku open
```

### View logs:
```bash
heroku logs --tail
```

---

## Google Cloud Run

**Best for**: Auto-scaling with pay-per-use pricing

### Prerequisites:
- Google Cloud account
- gcloud CLI installed

### Steps:

```bash
# Set project
gcloud config set project YOUR_PROJECT_ID

# Deploy
gcloud run deploy pdf-accessibility-tagger \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi

# Get URL
gcloud run services describe pdf-accessibility-tagger \
  --region us-central1 \
  --format 'value(status.url)'
```

### Features:
- Auto-scales to zero (pay only when used)
- 2M requests free per month
- Automatic HTTPS

---

## Docker Deployment

**Best for**: Self-hosting or any container platform

### Build and Run Locally:

```bash
# Build image
docker build -t pdf-tagger .

# Run container
docker run -p 8080:8080 \
  -e SECRET_KEY=your-secret-key \
  -e FLASK_DEBUG=False \
  pdf-tagger
```

### Deploy to Docker Hub:

```bash
# Tag image
docker tag pdf-tagger your-username/pdf-tagger:latest

# Push to Docker Hub
docker push your-username/pdf-tagger:latest
```

### Deploy to AWS ECS, Azure Container Instances, etc.:
- Push your image to a container registry
- Create a service using your container image
- Set environment variables
- Expose port 8080

---

## Environment Variables

All platforms support these environment variables:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Port to run on | 5000 | No (auto-set by platforms) |
| `SECRET_KEY` | Flask secret key | Random | Recommended for production |
| `FLASK_DEBUG` | Enable debug mode | True | No (set False in prod) |

---

## Platform Comparison

| Platform | Free Tier | Auto Deploy | Setup Time | Best For |
|----------|-----------|-------------|------------|----------|
| **Render** | ✓ 750 hrs/mo | ✓ | 2-3 min | Quick start |
| **Railway** | ✓ $5 credit | ✓ | 1-2 min | Easy setup |
| **Heroku** | ✗ ($7/mo) | ✓ | 5 min | Traditional PaaS |
| **Cloud Run** | ✓ 2M req/mo | Manual | 3-5 min | Auto-scaling |
| **Docker** | Varies | Manual | 5-10 min | Self-hosting |

---

## Post-Deployment

### Test Your Deployment:

1. Visit your app URL
2. Upload a test PDF
3. Verify processing works
4. Download the tagged PDF

### Monitor Your App:

**Render**: Dashboard → Your Service → Logs
**Railway**: Project → Deployments → Logs
**Heroku**: `heroku logs --tail`
**Cloud Run**: Cloud Console → Cloud Run → Logs

### Update Your App:

Most platforms auto-deploy when you push to GitHub:

```bash
git add .
git commit -m "Update feature"
git push origin main
```

Your changes will automatically deploy!

---

## Troubleshooting

### App won't start:
- Check logs for errors
- Verify all dependencies in `requirements.txt`
- Ensure `gunicorn` is installed

### Out of memory:
- Increase memory allocation in platform settings
- Render: Change instance type
- Cloud Run: Add `--memory 1Gi` flag

### Slow processing:
- Use a platform with more CPU/RAM
- Consider background job processing for large batches

### 404 errors:
- Verify the app is running at the correct URL
- Check if static files are being served correctly

---

## Need Help?

- Check platform documentation
- Open an issue on GitHub
- Review application logs
