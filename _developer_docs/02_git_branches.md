# Git Branching Strategy

Now that the backend and frontend are separated, keeping your branches clean is critical to prevent code conflicts and deployment disasters.

**Never commit frontend UI changes and backend matching logic into the same commit or branch.**

## The Core Branches

1. **`main`**
   - **What it is**: Production code only.
   - **Rule**: Never commit directly to `main`. Only merge tested features here when you are ready to release an update.

2. **`feature/frontend-mvp`**
   - **What it is**: Your active workspace for the React Native Mobile App UI.
   - **Rule**: This branch should ONLY contain changes to `app/`, `components/`, `constants/`, `hooks/`, and frontend config files `package.json`, `app.json`.
   - **Current Status**: Clean and isolated.

3. **`feature/backend-matching-engine`**
   - **What it is**: Your active workspace for the Python FastAPI server and matching logic.
   - **Rule**: This branch should ONLY contain changes to `backend/`.
   - **Current Status**: Contains the latest Python matching code.

4. **`feature/job-pipeline-worker`**
   - **What it is**: Your active workspace for the Python Scraping/Data Pipeline.
   - **Rule**: This branch should ONLY contain changes to `pipeline/`.

## Workflow: Building a Full-Stack Feature

Let's say you want to add a new "Save Job" button to the app. This requires both a database/backend change and a UI change.

**Step 1: Build the Backend First**

1. Switch to the backend branch: `git checkout feature/backend-matching-engine`
2. Write the API endpoint in `backend/routers/`.
3. Test the API locally using cURL or Postman.
4. Commit and Push: `git commit -m "feat(api): add save job endpoint"`

**Step 2: Build the Frontend Second**

1. Switch to the frontend branch: `git checkout feature/frontend-mvp`
2. Ensure your local Python backend is still running in the background.
3. Write the React Native button in `app/(tabs)/explore.tsx` to call your new endpoint.
4. Test it in the iOS/Android simulator.
5. Commit and Push: `git commit -m "feat(ui): add save job button"`

*By separating the work like this, if the UI code has a bug and needs to be reverted, it doesn't accidentally revert your API changes too!*
