# Vision Narrator MVP (Next.js)

## Setup
1) Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`
2) Install deps:
   ```bash
   npm install
   ```
3) Run:
   ```bash
   npm run dev
   ```

Open on mobile: `http://<your-lan-ip>:3000`

## Notes
- Uses browser `getUserMedia` for camera.
- Sends one compressed JPEG frame every interval.
- Server-side Next.js route calls OpenAI Responses API (Vision).
- Includes simple smoothing/stability (reduces flicker & repeat speech).
