un # AutoPress AI - Local Development Setup

Welcome to the local development environment for AutoPress AI. This guide will walk you through the steps to get the project running on your own machine using Visual Studio Code.

## 1. Prerequisites

Before you begin, ensure you have the following installed:

-   **Node.js**: Version 18.x or later. You can download it from [nodejs.org](https://nodejs.org/). This installation will also include `npm` (Node Package Manager).
-   **Visual Studio Code**: The recommended code editor. Download it from [code.visualstudio.com](https://code.visualstudio.com/).

## 2. Installation

1.  **Open the Project:** Open the downloaded project folder in Visual Studio Code.
2.  **Open the Terminal:** In VS Code, open a new terminal by going to `Terminal` > `New Terminal` in the top menu.
3.  **Install Dependencies:** In the terminal, run the following command to install all the necessary packages defined in `package.json`.

    ```bash
    npm install
    ```

    This process might take a few minutes.

## 3. Environment Variables

Secret keys and configuration values are stored in environment variables. The project uses a `.env.local` file for this, which you need to create.

1.  **Create the File:** In the root of your project folder, find the file named `.env.local.example`. Duplicate this file and rename the copy to `.env.local`.

2.  **Fill in the Values:** Open the new `.env.local` file. You will need to fill in the placeholder values with your actual credentials.

    -   `GOOGLE_API_KEY`:
        -   Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
        -   Create a new API key and copy-paste it here.

    -   `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` & `RECAPTCHA_SECRET_KEY`:
        -   Go to the [Google reCAPTCHA v3 Admin Console](https://www.google.com/recaptcha/admin/create).
        -   Register a new site. In the **Domains** section, you must add the hostname of the environment where the app is running. Google needs to know which domains are allowed to use your keys.
        -   **For local development:** If you are running `npm run dev` on your own machine, add `localhost`.
        -   **For Firebase Studio:** The app runs on a unique domain. Look at your browser's address bar. The URL will look something like `https://1234.cluster-xyz.cloudworkstations.dev`. Add just the hostname part (e.g., `1234.cluster-xyz.cloudworkstations.dev`) to the list of allowed domains in your reCAPTCHA settings.
        -   After registering the domain(s), copy the "Site Key" and "Secret Key" into your `.env.local` file.

    -   `FIREBASE_SERVICE_ACCOUNT_JSON`:
        -   Go to your Firebase project console.
        -   Navigate to `Project settings` (click the gear icon) > `Service accounts`.
        -   Click **"Generate new private key"**. A JSON file will be downloaded.
        -   Open the JSON file, copy its **entire content**, and paste it as a single line string inside the quotes for `FIREBASE_SERVICE_ACCOUNT_JSON`.

    -   `NEXT_PUBLIC_FIREBASE_*` variables:
        -   In your Firebase project console, go to `Project settings` > `General`.
        -   Scroll down to the "Your apps" section and find your web app.
        -   Click on the **"SDK setup and configuration"** section and select **"Config"**.
        -   Copy the values from the `firebaseConfig` object and paste them into the corresponding `NEXT_PUBLIC_` variables in your `.env.local` file.

**Important:** The `.env.local` file contains sensitive information and should **never** be committed to public version control (like GitHub).

## 4. Running the Project

Once the dependencies are installed and your `.env.local` file is configured, you can start the development server.

1.  **Start the Server:** In the VS Code terminal, run:

    ```bash
    npm run dev
    ```

2.  **Access the Application:** Open your web browser and go to the following address:

    [http://localhost:9002](http://localhost:9002)

You should now see the application's login page. You can log in and start using it locally. The terminal window in VS Code will now show you all the server-side logs, which is perfect for debugging!

### Troubleshooting Build Errors
If you encounter strange build errors, especially messages like `Module not found` for internal Next.js files, it's likely due to a corrupted build cache. You can resolve this by running the reset script:

```bash
npm run dev:reset
```
This command will delete the `.next` cache directory, remove `node_modules`, clean the `npm` cache, reinstall all dependencies, and then start the development server.

## 5. Deploying with Vercel

To deploy your application to Vercel, you can use the Vercel CLI.

1.  **Install Vercel CLI:** If you don't have it, install it globally.
    ```bash
    npm install -g vercel
    ```

2.  **Log in to Vercel:**
    ```bash
    vercel login
    ```

3.  **Link Your Project:** Navigate to your project's directory in the terminal and link it to a new or existing Vercel project.
    ```bash
    vercel link
    ```
    Follow the command-line prompts.

4.  **Set Environment Variables:** Go to your project's dashboard on the Vercel website. Navigate to `Settings` > `Environment Variables`. Copy all the variables from your local `.env.local` file and add them here. This is a crucial step for the deployed application to function correctly.

5.  **Deploy:**
    - To deploy to a preview environment:
      ```bash
      vercel
      ```
    - To deploy to production:
      ```bash
      vercel --prod
      ```

Vercel will build and deploy your application, providing you with a live URL once it's complete.
