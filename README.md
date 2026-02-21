<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1wOQUkCU2nfL0MV3pFY02Rty_Pfof7XXM

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

*Once the frontend is loaded, you can collapse the sidebar using the chevron button in the top-left; the application will remember your choice across reloads.*


### ⚠️ Auto-Tune Deprecated

The Auto-Tune feature and corresponding backend endpoint have been removed
from the application.  All optimization workflows now proceed via manual grid
search or Walk-Forward Analysis.  Any references in the UI or API to
"auto-tune" have been cleaned up accordingly.

### 🔧 Secondary Risk Optimization

A new optional two‑phase search is available in the optimisation page.  After
specifying the usual strategy parameter ranges you can enable the "stop-loss /
take-profit" toggle and provide ranges for those risk parameters.

Optionally you can run the full search immediately, or select a best candidate
from the primary results table and click **Choose**; a helper panel will
appear allowing you to execute a second SL/TP-only optimisation on that fixed
configuration.  This two-step workflow helps you inspect the strategy space
before committing to a narrower risk sweep.

The server
first performs the normal grid search and then runs a second Optuna study with
risk parameters while holding the primary strategy settings fixed.  Responses
include `riskGrid`, `bestRiskParams` and `combinedParams` so the frontend can
display risk results and allow applying fully merged parameter sets.