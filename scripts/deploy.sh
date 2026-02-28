#!/bin/bash
set -euo pipefail

# GongIntel Deploy Script
# Deploys API to Cloud Run and Web to Cloud Storage

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="gong-intel-api"
WEB_BUCKET="${WEB_BUCKET:-gs://${PROJECT_ID}-gong-intel-web}"

echo "=== Deploying GongIntel ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# ---- API (Cloud Run) ----
echo "--- Building API Docker image ---"
docker build -t "gcr.io/${PROJECT_ID}/${SERVICE_NAME}" -f apps/api/Dockerfile .

echo "--- Pushing to Container Registry ---"
docker push "gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "--- Deploying to Cloud Run ---"
gcloud run deploy "$SERVICE_NAME" \
  --image "gcr.io/${PROJECT_ID}/${SERVICE_NAME}" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --set-env-vars "NODE_ENV=production,ALLOWED_DOMAIN=cast.ai" \
  --project "$PROJECT_ID"

API_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)' --project "$PROJECT_ID")
echo "API deployed at: $API_URL"

# ---- Web (Cloud Storage) ----
echo ""
echo "--- Building Web frontend ---"
cd apps/web
VITE_API_URL="$API_URL" bun run build
cd ../..

echo "--- Deploying to Cloud Storage ---"
gsutil -m rsync -r -d apps/web/dist "$WEB_BUCKET"
gsutil web set -m index.html -e index.html "$WEB_BUCKET"

echo ""
echo "=== Deploy complete ==="
echo "API: $API_URL"
echo "Web: https://storage.googleapis.com/${PROJECT_ID}-gong-intel-web/index.html"
echo ""
echo "Remember to set secrets via:"
echo "  gcloud run services update $SERVICE_NAME --set-secrets=..."
