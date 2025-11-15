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
let currentIterationCount: number = 0;

// ============================================================================
// Logging
// ============================================================================

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

// ============================================================================
// Git Operations
// ============================================================================

/**
 * Gets the workspace root path
 */
function getWorkspaceRoot(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        log('No workspace folders found');
        return null;
    }
    return workspaceFolders[0].uri.fsPath;
}

/**
 * Gets the current git HEAD commit hash
 */
async function getCurrentGitHead(): Promise<string | null> {
    try {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return null;
        }

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
 * Gets the initial git HEAD for monitoring
 */
async function getInitialGitHead(): Promise<string | null> {
    const initialHead = await getCurrentGitHead();
    if (!initialHead) {
        log('ERROR: Not in a git repository or unable to get HEAD', true);
        return null;
    }
    log(`Monitoring for git commit (initial HEAD: ${initialHead.substring(0, 7)}...)`);
    return initialHead;
}

/**
 * Checks if a commit has occurred by comparing HEAD hashes
 */
function hasCommitOccurred(initialHead: string, currentHead: string | null): boolean {
    return currentHead !== null && currentHead !== initialHead;
}

/**
 * Logs commit detection details
 */
function logCommitDetection(initialHead: string, currentHead: string): void {
    log(`✓ Git commit detected! (new HEAD: ${currentHead.substring(0, 7)}...)`, true);
    log(`  Old HEAD: ${initialHead.substring(0, 7)}...`);
    log(`  New HEAD: ${currentHead.substring(0, 7)}...`);
}

/**
 * Waits for a specified delay in milliseconds
 */
function waitForDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes Command+W using AppleScript to close active editor
 */
async function executeCommandW(): Promise<void> {
    try {
        log('Executing Command+W via AppleScript (close active editor)...');
        await execAsync('osascript -e "tell application \\"System Events\\" to keystroke \\"i\\" using command down"');
        await execAsync('osascript -e "tell application \\"System Events\\" to keystroke \\"w\\" using command down"');
        log('✓ Command+W executed successfully via AppleScript', true);
    } catch (error) {
        log(`ERROR: Failed to execute Command+W via AppleScript: ${error}`, true);
        throw error;
    }
}

/**
 * Checks if the loop should stop
 */
function checkIfShouldStop(): boolean {
    return shouldStop;
}

/**
 * Polls for git commit changes at specified intervals
 */
async function pollForGitCommit(
    initialHead: string,
    pollInterval: number,
    maxWaitTime: number
): Promise<boolean> {
    const startTime = Date.now();

    return new Promise(async (resolve) => {
        while (true) {
            await waitForDelay(500);
            if (checkIfShouldStop()) {
                log('Loop stopped by user', true);
                resolve(false);
                return;
            }
            const elapsed = Date.now() - startTime;
            if (elapsed > pollInterval) {
                break;
            }
        }

        const currentHead = await getCurrentGitHead();

        if (hasCommitOccurred(initialHead, currentHead)) {
            logCommitDetection(initialHead, currentHead!);
            resolve(true);
        }
    });
}

/**
 * Waits for a git commit to occur and then executes Command+W (close active editor)
 */
async function waitForGitCommitAndExecuteCommandW(): Promise<boolean> {
    log('=== Starting git commit monitoring ===', true);

    const initialHead = await getInitialGitHead();
    if (!initialHead) {
        return false;
    }

    const pollInterval = 20000; // 20 seconds
    const maxWaitTime = 20 * 60 * 1000; // 20 minutes

    const commitDetected = await pollForGitCommit(initialHead, pollInterval, maxWaitTime);

    if (!commitDetected) {
        log('=== Git commit monitoring completed (stopped) ===');
        return false;
    }

    if (checkIfShouldStop()) {
        log('Loop stopped by user before executing Command+W', true);
        return false;
    }

    log('Waiting 5 seconds before executing Command+W...');
    await waitForDelay(5000);

    if (checkIfShouldStop()) {
        log('Loop stopped by user during wait', true);
        return false;
    }

    await executeCommandW();
    log('=== Git commit monitoring completed ===');
    return true;
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Finds all files matching the ralph-prompt.* pattern
 */
async function findRalphPromptFiles(): Promise<vscode.Uri[]> {
    log('Step 1: Searching for ralph-prompt.* files...');
    const files = await vscode.workspace.findFiles('**/ralph-prompt.*', null, 100);
    log(`Found ${files.length} file(s) matching pattern`);
    return files;
}

/**
 * Creates a file item for the quick pick
 */
function createFileItem(file: vscode.Uri): { label: string; description: string; file: vscode.Uri } {
    return {
        label: vscode.workspace.asRelativePath(file),
        description: file.fsPath,
        file: file
    };
}

/**
 * Selects a file, reusing the previously selected file if available
 */
async function selectFile(files: vscode.Uri[]): Promise<vscode.Uri | null> {
    log('Step 2: Selecting file...');

    if (selectedFile) {
        const fileItem = files.find(f => f.fsPath === selectedFile!.fsPath);
        if (fileItem) {
            log(`Reusing previously selected file: ${vscode.workspace.asRelativePath(fileItem)}`);
            return fileItem;
        } else {
            log(`Previously selected file not found, using: ${vscode.workspace.asRelativePath(files[0])}`);
            selectedFile = files[0];
            return files[0];
        }
    }

    const fileItems = files.map(createFileItem);
    const selectedItem = await vscode.window.showQuickPick(fileItems, {
        placeHolder: 'Select a ralph-prompt file'
    });

    if (!selectedItem) {
        log('User cancelled file selection');
        return null;
    }

    selectedFile = selectedItem.file;
    log(`Using file: ${selectedItem.label}`);
    return selectedItem.file;
}

/**
 * Reads the content of a file
 */
async function readFileContent(file: vscode.Uri): Promise<string> {
    log('Step 3: Reading file content...');
    try {
        const document = await vscode.workspace.openTextDocument(file);
        const content = document.getText();
        log(`File content read successfully (${content.length} characters)`);
        return content;
    } catch (error) {
        log(`ERROR: Failed to read file: ${error}`, true);
        throw error;
    }
}

// ============================================================================
// UI/Editor Operations
// ============================================================================

/**
 * Focuses the active editor group
 */
async function focusEditor(): Promise<void> {
    log('Step 4: Focusing active editor group...');
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    await waitForDelay(50);
    log('Editor focused');
}

/**
 * Copies text to the clipboard
 */
async function copyToClipboard(text: string): Promise<void> {
    log('Step 5: Copying content to clipboard...');
    await vscode.env.clipboard.writeText(text);
    await waitForDelay(50);
    log('Content copied to clipboard');
}

/**
 * Activates composer mode using keyboard shortcuts
 */
async function activateComposerMode(): Promise<void> {
    log('Step 6: Executing composerMode.agent (Option+Cmd+B)...');
    await vscode.commands.executeCommand('composerMode.agent');
    await waitForDelay(100);
    await execAsync('osascript -e "tell application \\"System Events\\" to keystroke \\"w\\" using command down"');
    await waitForDelay(100);
    await execAsync('osascript -e "tell application \\"System Events\\" to keystroke \\"i\\" using command down"');
    await waitForDelay(100);
    log('Composer mode activated');
}

/**
 * Pastes content from clipboard
 */
async function pasteContent(): Promise<void> {
    log('Step 7: Pasting content (Cmd+V)...');
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    await waitForDelay(200);
    log('Content pasted');
}

/**
 * Simulates Enter keypress with fallback methods
 */
async function simulateEnterKey(): Promise<void> {
    log('Step 8: Simulating Enter keypress via AppleScript...');
    await waitForDelay(100);

    try {
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
}

// ============================================================================
// Workflow Execution
// ============================================================================

/**
 * Executes one iteration of the main workflow
 */
async function executeWorkflowIteration(): Promise<boolean> {
    if (checkIfShouldStop()) {
        return false;
    }

    log('=== Starting workflow iteration ===', true);

    try {
        const files = await findRalphPromptFiles();
        if (files.length === 0) {
            log('ERROR: No files found matching pattern ralph-prompt.*', true);
            vscode.window.showErrorMessage('No files found matching pattern ralph-prompt.*');
            return false;
        }

        const selected = await selectFile(files);
        if (!selected) {
            return false;
        }

        if (checkIfShouldStop()) {
            return false;
        }

        const fileContent = await readFileContent(selected);
        if (checkIfShouldStop()) {
            return false;
        }

        await focusEditor();
        await copyToClipboard(fileContent);

        if (checkIfShouldStop()) {
            return false;
        }

        await activateComposerMode();
        await pasteContent();

        if (checkIfShouldStop()) {
            return false;
        }

        await simulateEnterKey();

        if (checkIfShouldStop()) {
            return false;
        }

        log('Step 9: Starting git commit monitoring...');
        const result = await waitForGitCommitAndExecuteCommandW();
        log('=== Workflow iteration completed ===');
        return result;
    } catch (error) {
        log(`ERROR in workflow iteration: ${error}`, true);
        vscode.window.showErrorMessage(`Failed to execute workflow: ${error}`);
        return false;
    }
}

// ============================================================================
// Status Bar Management
// ============================================================================

/**
 * Updates the status bar to show current loop status
 */
function updateStatusBar(): void {
    if (isLooping) {
        statusBarItem.text = `$(sync~spin) Ralph: Running (Iteration ${currentIterationCount})`;
        statusBarItem.tooltip = `Ralph Extension is running in loop mode - Current iteration: ${currentIterationCount}`;
        statusBarItem.show();
        stopStatusBarItem.text = '$(stop) Stop';
        stopStatusBarItem.tooltip = 'Click to stop the loop';
        stopStatusBarItem.show();
    } else {
        statusBarItem.hide();
        stopStatusBarItem.hide();
    }
}

// ============================================================================
// Loop Management
// ============================================================================

/**
 * Resets the loop state
 */
function resetLoopState(): void {
    isLooping = false;
    shouldStop = false;
    currentIterationCount = 0;
    selectedFile = null;
    updateStatusBar();
}

/**
 * Runs the main workflow loop
 */
async function runWorkflowLoop(): Promise<void> {
    shouldStop = false;
    isLooping = true;
    currentIterationCount = 0;
    updateStatusBar();

    log('=== Starting loop mode ===', true);
    let iterationCount = 0;

    try {
        while (!shouldStop) {
            iterationCount++;
            currentIterationCount = iterationCount;
            updateStatusBar();
            log(`\n--- Iteration ${iterationCount} ---`, true);

            const result = await executeWorkflowIteration();

            if (shouldStop || !result) {
                break;
            }

            await waitForDelay(1000);
        }
    } catch (error) {
        log(`ERROR in loop: ${error}`, true);
        vscode.window.showErrorMessage(`Error in loop: ${error}`);
    } finally {
        resetLoopState();
        log(`=== Loop stopped after ${iterationCount} iteration(s) ===`, true);
        vscode.window.showInformationMessage(`Ralph Extension loop stopped after ${iterationCount} iteration(s)`);
    }
}

// ============================================================================
// Extension Activation
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
    // Initialize output channel
    outputChannel = vscode.window.createOutputChannel('Ralph Extension');
    const version = context.extension.packageJSON.version || 'unknown';
    log(`Ralph Extension is now active! (version ${version})`, true);

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

        await runWorkflowLoop();
    });

    context.subscriptions.push(disposable, typeCommand, stopCommand, statusBarItem, stopStatusBarItem, outputChannel);
}

export function deactivate() { }
