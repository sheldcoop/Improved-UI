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


### 🛠️ Auto-Tune Data Requirements

When calling the backend **/api/v1/optimization/auto-tune** endpoint the
(notice that the backtest results now also include a `paramSet` field that
reflects the strategy parameters used for the simulation; this is echoed back
from `/market/backtest/run` to make it easier for the frontend to display the
exact configuration on the analytics page)

*UI behaviour update:* clicking **Apply** on an optimization grid no longer
triggers an immediate run.  Parameters are still injected into the backtest
context and you are taken to the Backtest page, but the simulation must be
started manually by pressing **Run Simulation**.  This gives you a moment to
verify the configuration before execution.

*Navigation persistence:* while on the Optimizer page, results (grid / WFO
output / best parameters) are now stored in shared context.  You can leave
the tab, run a backtest or review another page, and return to find your
previous results intact instead of having to re-run the optimisation.
server requires **at least `lookbackMonths × 21` historical bars** cached
*before* the `startDate` you supply.  If the cache doesn't cover the full
lookback window the route returns a `400` response with a message like:

> Only 0 bars found in the 12-month lookback window before 2023‑07‑01.  Your
> loaded cache covers 2023‑01‑15 → 2024‑02‑20.  Load more historical data or
> reduce the Auto-Tune lookback period.

This behaviour is logged on the server; make sure to load enough history or
pick a smaller lookback/start date combination before running Auto-Tune.
