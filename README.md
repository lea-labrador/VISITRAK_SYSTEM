# GitHub Clone and npm Installation Guide — Windows

## 1. Install Git

Download and install **Git for Windows**.

During installation, the default options are usually fine.

After installation, open **Command Prompt (CMD)** or **PowerShell** and check:

```bash
git --version
```

You should see something like:

```text
git version 2.x.x
```

---

## 2. Install Node.js and npm

Download and install the **LTS version of Node.js**.

npm is automatically installed together with Node.js.

After installation, **close and reopen CMD or PowerShell**.

Check Node.js:

```bash
node --version
```

Check npm:

```bash
npm --version
```

You should see something similar to:

```text
v22.x.x
10.x.x
```

---

## 3. Configure Git

If this is the first time using Git on the computer:

```bash
git config --global user.name "Your Name"
```

Then:

```bash
git config --global user.email "your-email@example.com"
```

Check your configuration:

```bash
git config --global --list
```

---

## 4. Go to the Documents Folder

Open **CMD** or **PowerShell**.

To store the project in your Documents folder:

```bash
cd %USERPROFILE%\Documents
```

---

## 5. Clone the GitHub Repository

Run:

```bash
git clone https://github.com/lea-labrador/VISITRAK_SYSTEM.git
```

After the download finishes, Git will create:

```text
VISITRAK_SYSTEM
```

---

## 6. Enter the Project

Run:

```bash
cd VISITRAK_SYSTEM
```

Check the files:

```bash
dir
```

You should find the project's `package.json`.

For example:

```text
package.json
package-lock.json
src
public
```

---

## 7. Install npm Dependencies

Since `package.json` is in the project folder, simply run:

```bash
npm install
```

This will install all the packages required by the project.

It will create:

```text
node_modules
```

You don't need to install the packages individually.

---

## 8. Run the Project

After `npm install` finishes:

```bash
npm run dev
```

If the project uses Vite, you should see something like:

```text
Local: http://localhost:5173/
```

Open that address in your browser.

---

## 9. If `.env.example` Exists

Check the project files:

```bash
dir
```

If you see:

```text
.env.example
```

create the `.env` file.

In PowerShell:

```powershell
Copy-Item .env.example .env
```

Then open it with VS Code:

```bash
code .env
```

Enter the required environment variables.

Do **not** commit `.env` to GitHub if it contains passwords, API keys, or database credentials.

---

# Complete Setup From Scratch

Once Git and Node.js are installed, the entire process is:

```bash
git clone https://github.com/lea-labrador/VISITRAK_SYSTEM.git

cd VISITRAK_SYSTEM

npm install

npm run dev
```

That's it.

**Git → Node.js/npm → Clone → Enter project → Install dependencies → Run**

---

# Updating the Project Later

If you already cloned the repository, **do not clone it again**.

Go to the project:

```bash
cd %USERPROFILE%\Documents\VISITRAK_SYSTEM
```

Get the latest version:

```bash
git pull
```

If the project's dependencies changed:

```bash
npm install
```

Then run:

```bash
npm run dev
```

---

# Quick Reference

```bash
# Clone
git clone https://github.com/lea-labrador/VISITRAK_SYSTEM.git

# Enter project
cd VISITRAK_SYSTEM

# Install dependencies
npm install

# Run project
npm run dev

# Update project later
git pull
```

## Verify Installation

Before starting, make sure these commands work:

```bash
git --version
node --version
npm --version
```

If all three return a version number, the Windows computer is ready to run **VISITRAK_SYSTEM**.
