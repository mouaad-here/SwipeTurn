# How to Run & Test the App Locally

Because SwipTurn has a separated architecture, you cannot just run `npm start` and expect the whole app to work. You must start the Backend Server AND the Frontend App simultaneously in two different terminal windows.

## Step 1: Start the Python Backend

The mobile app relies entirely on the FastAPI backend for its job feed and user profiles. If the backend is off, the mobile app will show network errors or infinite loading spinners.

1. **Open Terminal 1**.
2. **Navigate to the backend folder**:

   ```bash
   cd backend
   ```

3. **Activate your virtual environment**:

   ```bash
   # On Windows:
   .\venv\Scripts\activate
   ```

4. **Start the server**:

   ```bash
   fastapi dev main.py
   # OR
   uvicorn main:app --reload
   ```

5. **Verify**: Open your browser and go to `http://localhost:8000/docs`. You should see the Swagger API documentation.
6. **LEAVE THIS TERMINAL OPEN AND RUNNING.**

---

## Step 2: Start the React Native Frontend

Now that the API is running at `http://localhost:8000`, you can start the mobile app.

1. **Open Terminal 2** (Keep Terminal 1 running!).
2. **Ensure you are in the project root folder** (not the backend folder).
3. **Check your connection constant**:
   Make sure `constants/api.ts` is pointing to your local machine:

   ```typescript
   export const API_URL = 'http://10.0.2.2:8000'; // If using Android Emulator
   // export const API_URL = 'http://localhost:8000'; // If using iOS Simulator or Web
   // export const API_URL = 'http://<YOUR-WIFI-IP>:8000'; // If using Expo Go on a physical phone
   ```

4. **Start Expo**:

   ```bash
   npx expo start -c
   ```

5. Press `a` to open Android, `i` to open iOS, or scan the QR code with your physical phone.

---

## Troubleshooting Connectivity

If the app says "Network Error" or "Failed to fetch":

1. **Is the Backend Running?** Check Terminal 1. If it crashed because of a Python syntax error, the app can't talk to it. Restart it.
2. **Are you on a Physical Phone?** A physical iPhone/Android CANNOT understand `http://localhost:8000`. Localhost means the phone itself.
   - *Fix:* Find your computer's local IP address (e.g., `192.168.1.55`), and update `constants/api.ts` to `export const API_URL = 'http://192.168.1.55:8000';`. Ensure the phone and computer are on the same WiFi network.
3. **Are you on an Android Emulator?** The Android Emulator cannot reach `localhost:8000` because it runs in a virtual machine.
   - *Fix:* Use `http://10.0.2.2:8000` in `constants/api.ts`. This is a special alias the emulator uses to talk to your Windows host machine.
