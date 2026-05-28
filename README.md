<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.
https://ai.studio/apps/198f880a-04ba-4ec3-bc29-c0e57d23be9f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## 🚀 Auto-Deployment & Git Workflow

This project is connected directly to **GitHub** and **Vercel** with a hard-coded automation rule.

### 🔗 Repositories & Hosting
- **GitHub Repository**: [louisaimaster-lab/knights-quest](https://github.com/louisaimaster-lab/knights-quest)
- **Production URL**: [https://knights-quest-two.vercel.app](https://knights-quest-two.vercel.app)

### ⚡ Auto-Sync Hard Rule
Whenever you or the Antigravity AI agent makes an update to the codebase from this workspace, the changes must be pushed to GitHub to trigger Vercel. 

To easily automate this, we created sync scripts in the project root:
- **Windows Command/Batch**: `.\sync-project.bat "[Commit Message]"`
- **PowerShell**: `.\sync-project.ps1 "[Commit Message]"`

**Agent Execution Policy:** The AI agent must run `.\sync-project.bat "<description of changes>"` at the end of every successful coding task to ensure your live website is always fully up-to-date.