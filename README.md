# Ralph Extension

A custom Cursor extension.

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile the extension:
   ```bash
   npm run compile
   ```

3. To test the extension in Cursor:
   - Press `F5` to launch a new Extension Development Host window with your extension loaded
   - OR package and install it in your current instance (see below)

## Installing in Current Cursor Instance

### Option 1: Package and Install from VSIX

1. Install the VS Code Extension Manager (if not already installed):
   ```bash
   npm install -g @vscode/vsce
   ```

2. Package your extension:
   ```bash
   vsce package
   ```

3. In Cursor, open the Extensions view (`Cmd+Shift+X` on Mac, `Ctrl+Shift+X` on Windows/Linux)
4. Click the `...` menu (three dots) in the Extensions view
5. Select "Install from VSIX..."
6. Choose the generated `.vsix` file

### Option 2: Symlink Method (Development)

You can symlink your extension directory to Cursor's extensions folder:

**On macOS:**
```bash
ln -s /Users/d.antonini/cursor-ralph-extension ~/.cursor/extensions/ralph-extension
```

Then restart Cursor. The extension will be loaded from your development directory.

## Features

- Hello World command: Run "Hello World" from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)

