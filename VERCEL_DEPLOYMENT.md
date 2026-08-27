# Lumina Vercel Deployment Guide

This document outlines the configuration and environment setup required to deploy the Lumina frontend web application to Vercel.

## 1. Automatic Project Setup via `vercel.json`
A [vercel.json](file:///d:/Lumina/vercel.json) file has been created at the root directory. Vercel will automatically read this file when importing the repository, setting the following options:
*   **Build Command**: `npx expo export -p web`
*   **Output Directory**: `dist`
*   **Rewrites**: Configured to map all sub-routes to `index.html` to support deep linking and browser refreshes on subpages (e.g. `/learn`, `/crucible`).

## 2. Environment Variables Configuration
To link the web client with the Render backend, you must add the following environment variable to Vercel:

| Key | Value | Description |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_API_URL` | `https://lumina-backend-psdz.onrender.com` | Deployed production Render backend API URL |

### Setup Steps in Vercel UI
1. Go to your **Vercel Dashboard** and click **Add New Project**.
2. Select your imported Lumina GitHub repository.
3. Expand the **Environment Variables** accordion.
4. Input `EXPO_PUBLIC_API_URL` as the Name and `https://lumina-backend-psdz.onrender.com` as the Value.
5. Click **Add**, then click **Deploy**.

## 3. Post-Deployment CORS Update
Once Vercel completes the build and assigns you a URL (e.g., `https://lumina-web.vercel.app`), update your Render backend's CORS settings:
1. Go to your **Render Dashboard** → Select `lumina-backend`.
2. Navigate to **Environment**.
3. Locate the `CORS_ORIGINS` key and replace `*` with your exact Vercel URL (e.g. `https://lumina-web.vercel.app`).
4. Save the changes to restart the server and restrict access to your production domain.
