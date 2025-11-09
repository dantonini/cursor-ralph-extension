import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Create output channel for logging
let outputChannel: vscode.OutputChannel;

/**
 * Logger utility that writes to VS Code's Output panel
 */
function log(message: string, showChannel: boolean = false): void {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;

    if (outputChannel) {
        outputChannel.appendLine(logMessage);
        if (showChannel) {
            outputChannel.show(true); // Show and preserve focus
        }
    } else {
        // Fallback to console if channel not initialized
        console.log(logMessage);
    }
}

/**
 * Gets the current git HEAD commit hash
 */
async function getCurrentGitHead(): Promise<string | null> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            log('No workspace folders found');
            return null;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        log(`Getting git HEAD from: ${workspaceRoot}`);
        const { stdout } = await execAsync('git rev-parse HEAD', { cwd: workspaceRoot });
        const headHash = stdout.trim();
        log(`Current git HEAD: ${headHash.substring(0, 7)}...`);
        return headHash;
    } catch (error) {
        log(`Failed to get git HEAD: ${error}`, true);
        return null;
    }
}

/**
 * Waits for a git commit to occur and then executes Command+W (close active editor)
 */
async function waitForGitCommitAndExecuteCommandW(): Promise<void> {
    log('=== Starting git commit monitoring ===', true);

    // Get the initial commit hash
    const initialHead = await getCurrentGitHead();

    if (!initialHead) {
        log('ERROR: Not in a git repository or unable to get HEAD', true);
        return;
    }

    log(`Monitoring for git commit (initial HEAD: ${initialHead.substring(0, 7)}...)`);

    // Poll for commit changes (check every 5s)
    const pollInterval = 5000;
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes max wait time
    const startTime = Date.now();
    let pollCount = 0;

    const checkForCommit = async (): Promise<void> => {
        return new Promise((resolve, reject) => {
            const intervalId = setInterval(async () => {
                pollCount++;

                // Check if we've exceeded max wait time
                const elapsed = Date.now() - startTime;
                if (elapsed > maxWaitTime) {
                    clearInterval(intervalId);
                    log(`Timeout waiting for git commit (waited ${Math.round(elapsed / 1000)}s)`, true);
                    resolve();
                    return;
                }

                // Log progress every 10 polls (every 5 seconds)
                if (pollCount % 10 === 0) {
                    log(`Still waiting... (${Math.round(elapsed / 1000)}s elapsed, checked ${pollCount} times)`);
                }

                // Check current HEAD
                const currentHead = await getCurrentGitHead();

                if (currentHead && currentHead !== initialHead) {
                    clearInterval(intervalId);
                    log(`✓ Git commit detected! (new HEAD: ${currentHead.substring(0, 7)}...)`, true);
                    log(`  Old HEAD: ${initialHead.substring(0, 7)}...`);
                    log(`  New HEAD: ${currentHead.substring(0, 7)}...`);

                    // Execute Command+W (close active editor)
                    try {
                        log('Executing Command+W (close active editor)...');
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                        log('✓ Command+W executed successfully', true);
                    } catch (error) {
                        log(`ERROR: Failed to execute Command+W: ${error}`, true);
                    }

                    resolve();
                }
            }, pollInterval);
        });
    };

    await checkForCommit();
    log('=== Git commit monitoring completed ===');
}

export function activate(context: vscode.ExtensionContext) {
    // Initialize output channel
    outputChannel = vscode.window.createOutputChannel('Ralph Extension');
    log('Ralph Extension is now active!', true);

    // Register a command
    let disposable = vscode.commands.registerCommand('ralph-extension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Ralph Extension!');
    });

    // Register command to execute sequence: focus IDE → Option+Cmd+B → Cmd+T → paste "123"
    let typeCommand = vscode.commands.registerCommand('ralph-extension.typeHelloWorld', async () => {
        log('=== Starting typeHelloWorld command ===', true);

        // Step 1: Find all files matching ralph-prompt.* pattern
        log('Step 1: Searching for ralph-prompt.* files...');
        const files = await vscode.workspace.findFiles('**/ralph-prompt.*', null, 100);
        log(`Found ${files.length} file(s) matching pattern`);

        if (files.length === 0) {
            log('ERROR: No files found matching pattern ralph-prompt.*', true);
            vscode.window.showErrorMessage('No files found matching pattern ralph-prompt.*');
            return;
        }

        // Step 2: Let user select a file
        log('Step 2: Showing file selection dialog...');
        const fileItems = files.map(file => ({
            label: vscode.workspace.asRelativePath(file),
            description: file.fsPath,
            file: file
        }));

        const selected = await vscode.window.showQuickPick(fileItems, {
            placeHolder: 'Select a ralph-prompt file'
        });

        if (!selected) {
            log('User cancelled file selection');
            return;
        }

        log(`User selected: ${selected.label}`);

        // Step 3: Read the file content
        log('Step 3: Reading file content...');
        let fileContent: string;
        try {
            const document = await vscode.workspace.openTextDocument(selected.file);
            fileContent = document.getText();
            log(`File content read successfully (${fileContent.length} characters)`);
        } catch (error) {
            log(`ERROR: Failed to read file: ${error}`, true);
            vscode.window.showErrorMessage(`Failed to read file: ${error}`);
            return;
        }

        // Step 4: Focus the entire IDE window/editor
        log('Step 4: Focusing active editor group...');
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await new Promise(resolve => setTimeout(resolve, 50));
        log('Editor focused');

        // Step 5: Copy the file content to clipboard
        log('Step 5: Copying content to clipboard...');
        await vscode.env.clipboard.writeText(fileContent);
        await new Promise(resolve => setTimeout(resolve, 50));
        log('Content copied to clipboard');

        // Step 6: Execute Option + Command + B
        log('Step 6: Executing composerMode.agent (Option+Cmd+B)...');
        await vscode.commands.executeCommand('composerMode.agent');
        await new Promise(resolve => setTimeout(resolve, 100));
        log('Composer mode activated');

        /*
        // Step 7: Execute Command + T (Quick Open dialog)
        await vscode.commands.executeCommand('workbench.action.quickOpen');
        await new Promise(resolve => setTimeout(resolve, 150));
*/
        // Step 7: Paste the text using Command+V
        log('Step 7: Pasting content (Cmd+V)...');
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        await new Promise(resolve => setTimeout(resolve, 200));
        log('Content pasted');

        // Step 8: Press Enter to trigger the action
        // Use native macOS keyboard simulation since type command doesn't work in custom panels
        // This simulates a real Enter keypress at the OS level using AppleScript
        log('Step 8: Simulating Enter keypress via AppleScript...');
        try {
            // Small delay to ensure paste is complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Use AppleScript to simulate Enter keypress on macOS
            // Note: This requires Accessibility permissions in System Settings
            await execAsync('osascript -e "tell application \\"System Events\\" to keystroke return"');
            log('✓ Enter keypress simulated successfully via AppleScript');
        } catch (error) {
            log(`WARNING: Native keyboard simulation failed: ${error}`);
            // Fallback: Try VS Code type command (though it likely won't work)
            try {
                log('Trying fallback: VS Code type command...');
                await vscode.commands.executeCommand('type', { text: '\n' });
                log('✓ Fallback type command succeeded');
            } catch (error2) {
                log(`WARNING: Type command also failed: ${error2}`);
                // Last resort: Try accept command
                try {
                    log('Trying last resort: accept command...');
                    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
                    log('✓ Last resort accept command succeeded');
                } catch (error3) {
                    log(`ERROR: All methods failed: ${error3}`, true);
                }
            }
        }

        // Step 9: Wait for git commit and execute Command+W when commit happens
        log('Step 9: Starting git commit monitoring...');
        await waitForGitCommitAndExecuteCommandW();
        log('=== typeHelloWorld command completed ===');
    });

    context.subscriptions.push(disposable, typeCommand, outputChannel);
}

export function deactivate() { }

