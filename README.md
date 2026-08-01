<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4c24a2f0-2598-431a-81c0-540f30c8c38c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and configure `MONGODB_URI`, `JWT_SECRET`, and Gmail SMTP (`SMTP_USER` and an App Password in `SMTP_PASS`).
3. Run the app:
   `npm run dev`
