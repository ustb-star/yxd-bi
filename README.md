<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and publish your app

This contains everything you need to run your app locally.

Public URL (current): https://casio-andrews-sperm-thomas.trycloudflare.com

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in `.env.local`
3. Run the app:
   `npm run dev`

## Cloudflare Named Tunnel + Fixed Domain

1. In Cloudflare Zero Trust, create a **Named Tunnel**.
2. Configure a **Public Hostname** (fixed domain), for example `bi.yourdomain.com`.
3. Point the hostname service to your local app address: `http://127.0.0.1:4173`.
4. Copy the Tunnel token and set it in your shell:
   `set CLOUDFLARE_TUNNEL_TOKEN=xxxx` (Windows CMD)  
   or  
   `$env:CLOUDFLARE_TUNNEL_TOKEN="xxxx"` (PowerShell)
5. Start local preview:
   `npm run preview:cloudflare`
6. In another terminal, start the named tunnel:
   `npm run tunnel:named`

After this, your fixed domain (for example `https://bi.yourdomain.com`) is the permanent public link.
