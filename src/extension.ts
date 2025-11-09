import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Create output channel for logging
let outputChannel: vscode.OutputChannel;

// Status bar items and loop control
let statusBarItem: vscode.StatusBarItem;
let stopStatusBarItem: vscode.StatusBarItem;
let isLooping: boolean = false;
let shouldStop: boolean = false;
let selectedFile: vscode.Uri | null = null;

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
async function waitForGitCommitAndExecuteCommandW(): Promise<boolean> {
    log('=== Starting git commit monitoring ===', true);

    // Get the initial commit hash
    const initialHead = await getCurrentGitHead();

    if (!initialHead) {
        log('ERROR: Not in a git repository or unable to get HEAD', true);
        return false;
    }

    log(`Monitoring for git commit (initial HEAD: ${initialHead.substring(0, 7)}...)`);

    // Poll for commit changes (check every 5s)
    const pollInterval = 5000;
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes max wait time
    const startTime = Date.now();
    let pollCount = 0;

    const checkForCommit = async (): Promise<boolean> => {
        return new Promise((resolve) => {
            const intervalId = setInterval(async () => {
                // Check if we should stop
                if (shouldStop) {
                    clearInterval(intervalId);
                    log('Loop stopped by user', true);
                    resolve(false);
                    return;
                }

                pollCount++;

                // Check if we've exceeded max wait time
                const elapsed = Date.now() - startTime;
                if (elapsed > maxWaitTime) {
                    clearInterval(intervalId);
                    log(`Timeout waiting for git commit (waited ${Math.round(elapsed / 1000)}s)`, true);
                    resolve(true);
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

                    // Check if we should stop before executing Command+W
                    if (shouldStop) {
                        log('Loop stopped by user before executing Command+W', true);
                        resolve(false);
                        return;
                    }

                    // Wait 5 seconds before executing Command+W
                    log('Waiting 5 seconds before executing Command+W...');
                    await new Promise(resolve => setTimeout(resolve, 5000));

                    // Check again if we should stop
                    if (shouldStop) {
                        log('Loop stopped by user during wait', true);
                        resolve(false);
                        return;
                    }

                    // Execute Command+W using AppleScript (close active editor)
                    try {
                        log('Executing Command+W via AppleScript (close active editor)...');
                        await execAsync('osascript -e "tell application \\"System Events\\" to keystroke \\"w\\" using command down"');
                        log('✓ Command+W executed successfully via AppleScript', true);
                    } catch (error) {
                        log(`ERROR: Failed to execute Command+W via AppleScript: ${error}`, true);
                    }

                    resolve(true);
                }
            }, pollInterval);
        });
    };

    const result = await checkForCommit();
    log('=== Git commit monitoring completed ===');
    return result;
}

/**
 * Executes one iteration of the main workflow
 */
async function executeWorkflowIteration(): Promise<boolean> {
    // Check if we should stop before starting
    if (shouldStop) {
        return false;
    }

    log('=== Starting workflow iteration ===', true);

    // Step 1: Find all files matching ralph-prompt.* pattern
    log('Step 1: Searching for ralph-prompt.* files...');
    const files = await vscode.workspace.findFiles('**/ralph-prompt.*', null, 100);
    log(`Found ${files.length} file(s) matching pattern`);

    if (files.length === 0) {
        log('ERROR: No files found matching pattern ralph-prompt.*', true);
        vscode.window.showErrorMessage('No files found matching pattern ralph-prompt.*');
        return false;
    }

    // Step 2: Let user select a file (only on first iteration)
    // For subsequent iterations, use the previously selected file
    log('Step 2: Selecting file...');

    let selected;
    if (selectedFile) {
        // Use previously selected file if it still exists
        const fileItem = files.find(f => f.fsPath === selectedFile!.fsPath);
        if (fileItem) {
            selected = {
                label: vscode.workspace.asRelativePath(fileItem),
                description: fileItem.fsPath,
                file: fileItem
            };
            log(`Reusing previously selected file: ${selected.label}`);
        } else {
            // File no longer exists, use first available
            const fileItems = files.map(file => ({
                label: vscode.workspace.asRelativePath(file),
                description: file.fsPath,
                file: file
            }));
            selected = fileItems[0];
            selectedFile = selected.file;
            log(`Previously selected file not found, using: ${selected.label}`);
        }
    } else {
        // First iteration - show picker
        const fileItems = files.map(file => ({
            label: vscode.workspace.asRelativePath(file),
            description: file.fsPath,
            file: file
        }));

        const selectedItem = await vscode.window.showQuickPick(fileItems, {
            placeHolder: 'Select a ralph-prompt file'
        });

        if (!selectedItem) {
            log('User cancelled file selection');
            return false;
        }
        selected = selectedItem;
        selectedFile = selected.file;
    }

    log(`Using file: ${selected.label}`);

    // Check if we should stop
    if (shouldStop) {
        return false;
    }

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
        return false;
    }

    // Check if we should stop
    if (shouldStop) {
        return false;
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

    // Check if we should stop
    if (shouldStop) {
        return false;
    }

    // Step 6: Execute Option + Command + B
    log('Step 6: Executing composerMode.agent (Option+Cmd+B)...');
    await vscode.commands.executeCommand('composerMode.agent');
    await new Promise(resolve => setTimeout(resolve, 100));
    log('Composer mode activated');

    // Step 7: Paste the text using Command+V
    log('Step 7: Pasting content (Cmd+V)...');
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    await new Promise(resolve => setTimeout(resolve, 200));
    log('Content pasted');

    // Check if we should stop
    if (shouldStop) {
        return false;
    }

    // Step 8: Press Enter to trigger the action
    log('Step 8: Simulating Enter keypress via AppleScript...');
    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        await execAsync('osascript -e "tell application \\"System Events\\" to keystroke return"');
        log('✓ Enter keypress simulated successfully via AppleScript');
    } catch (error) {
        log(`WARNING: Native keyboard simulation failed: ${error}`);
        try {
            log('Trying fallback: VS Code type command...');
            await vscode.commands.executeCommand('type', { text: '\n' });
            log('✓ Fallback type command succeeded');
        } catch (error2) {
            log(`WARNING: Type command also failed: ${error2}`);
            try {
                log('Trying last resort: accept command...');
                await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
                log('✓ Last resort accept command succeeded');
            } catch (error3) {
                log(`ERROR: All methods failed: ${error3}`, true);
            }
        }
    }

    // Check if we should stop
    if (shouldStop) {
        return false;
    }

    // Step 9: Wait for git commit and execute Command+W when commit happens
    log('Step 9: Starting git commit monitoring...');
    const result = await waitForGitCommitAndExecuteCommandW();
    log('=== Workflow iteration completed ===');
    return result;
}

/**
 * Updates the status bar to show current loop status
 */
function updateStatusBar(): void {
    if (isLooping) {
        statusBarItem.text = '$(sync~spin) Ralph: Running';
        statusBarItem.tooltip = 'Ralph Extension is running in loop mode';
        statusBarItem.show();
        stopStatusBarItem.text = '$(stop) Stop';
        stopStatusBarItem.tooltip = 'Click to stop the loop';
        stopStatusBarItem.show();
    } else {
        statusBarItem.hide();
        stopStatusBarItem.hide();
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Initialize output channel
    outputChannel = vscode.window.createOutputChannel('Ralph Extension');
    log('Ralph Extension is now active!', true);

    // Create status bar items
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    stopStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    stopStatusBarItem.command = 'ralph-extension.stopLoop';
    stopStatusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');

    // Register a command
    let disposable = vscode.commands.registerCommand('ralph-extension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Ralph Extension!');
    });

    // Register stop command
    let stopCommand = vscode.commands.registerCommand('ralph-extension.stopLoop', () => {
        if (isLooping) {
            shouldStop = true;
            log('Stop requested by user', true);
            vscode.window.showInformationMessage('Stopping Ralph Extension loop...');
        }
    });

    // Register command to execute sequence in a loop
    let typeCommand = vscode.commands.registerCommand('ralph-extension.typeHelloWorld', async () => {
        if (isLooping) {
            log('Loop is already running', true);
            vscode.window.showWarningMessage('Loop is already running. Click the stop button to stop it.');
            return;
        }

        // Reset stop flag and start looping
        shouldStop = false;
        isLooping = true;
        updateStatusBar();

        log('=== Starting loop mode ===', true);
        let iterationCount = 0;

        try {
            while (!shouldStop) {
                iterationCount++;
                log(`\n--- Iteration ${iterationCount} ---`, true);

                const result = await executeWorkflowIteration();

                // If workflow was stopped or failed, break the loop
                if (shouldStop || !result) {
                    break;
                }

                // Small delay before next iteration
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            log(`ERROR in loop: ${error}`, true);
            vscode.window.showErrorMessage(`Error in loop: ${error}`);
        } finally {
            isLooping = false;
            shouldStop = false;
            selectedFile = null; // Reset selected file
            updateStatusBar();
            log(`=== Loop stopped after ${iterationCount} iteration(s) ===`, true);
            vscode.window.showInformationMessage(`Ralph Extension loop stopped after ${iterationCount} iteration(s)`);
        }
    });

    context.subscriptions.push(disposable, typeCommand, stopCommand, statusBarItem, stopStatusBarItem, outputChannel);
}

export function deactivate() { }

